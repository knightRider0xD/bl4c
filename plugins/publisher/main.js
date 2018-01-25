var publisher       = 0;
var publisherTimer  = 0;
var publisherStatus = {status:0,complete:0,locked:0,lastDiscStatus:0,lastFileStatus:0};
var publisherFiles  = [];
var currentTcIndex  = 0;
var transcodedFiles = [];
var destFile        = '';
var spawn           = require('child_process').spawn;
var fs              = require('fs');
var system          = null;
var exiting         = 0;
var sio_hooks       = [];

var config = {
        "files_dir": "/home/user/recordings/",
        "working_dir": "/home/user/working/",
        "disc_drive": "/dev/sr0",
        "flash_disk_dir": "/run/media/user/",
        "burn_disc": 1,
        "disc_status": 0,
        "file_status": 0
};

exports.load = function (main_sys) {
    
    system = main_sys;
    
    system.setConfigDefaults(config);
    config = system.getConfig();
    
    if (!config.files_dir.endsWith('/')){
        config.files_dir += '/';
    }
    
    if (!config.flash_disk_dir.endsWith('/')){
        config.flash_disk_dir += '/';
    }
    
    publisherStatus.lastDiscStatus = config.disc_status;
    publisherStatus.lastFileStatus = config.file_status;
    
    system.registerSioEvent('connected', function(){
        system.doSioEmit('update', publisherStatus);
    });
    
    for(var i=0; i<sio_hooks.length; i++){
       system.registerSioEvent(sio_hooks[i].event, sio_hooks[i].callback); 
    }
    
    reloadAvailableFiles();
    reloadFlashDisks();
    
}

exports.unload = function () {
    stopPublisher("Shutting Down");
}

exports.notify = function (signalName, value) {
    //
}

sio_hooks.push({event:'getFileList', callback:function(){
    reloadAvailableFiles();
}});

sio_hooks.push({event:'getRemovableList', callback:function(){
    reloadFlashDisks();
}});
 
sio_hooks.push({event:'burnDisc', callback:function(discInfo){
    publishDisc(discInfo.sourceFNames, discInfo.menu, discInfo.resume);
}});

sio_hooks.push({event:'uploadFile', callback:function(uploadInfo){
    publishUpload(uploadInfo.sourceFNames, uploadInfo.destFName, uploadInfo.transcode, uploadInfo.protocol, uploadInfo.server, uploadInfo.username, uploadInfo.password, uploadInfo.resume);
}});

sio_hooks.push({event:'copyFile', callback:function(copyInfo){
    console.log(JSON.stringify(copyInfo));
    publishRemovableDrive(copyInfo.sourceFNames, copyInfo.destFName, copyInfo.transcode, config.flash_disk_dir+copyInfo.device, copyInfo.resume);
}});

sio_hooks.push({event:'cancel', callback:function(){
    stopPublisher("Cancelled by operator");
}});


function reloadAvailableFiles(){
    
    fs.readdir(config.files_dir, function (err, files) {
        if (err) {
            console.log('error getting recordings at '+config.files_dir+' ' + err);
            return;
        }
        publisherFiles = files.slice();
        system.doSioEmit('fileList', publisherFiles);
    });
}



// Clean Working Directories
function cleanDirs(root, names, callback){
    
    if(exiting){
        exiting = 0;
        return;
    }

    if (!root.endsWith('/')){
        root = root + '/';
    }
    
    /*for (var i = 0; i < names.length; i++) {
        names[i] = root+names[i];
    }*/
    
    publisher = spawn('rm', ['-rf'].concat(names),{cwd: root, env: process.env, detached: true});
    
    console.log('Publisher: Remove old files');

    publisher.on('error', function (err) {
        exiting = 1;
        console.log('Error cleaning Working Directories: '+err);
        publisherStatus.status = 'Error cleaning old files';
        publisherStatus.complete = -1;
        system.doSioEmit('update', publisherStatus);
        finished(true);
        publisher.kill('SIGTERM');
    });

    publisher.on('exit', function (code) {
        publisher = 0;
        if(exiting){
            exiting = 0;
            return;
        }
        callback();
    });
    
}

// Create Working Directories
function setupDirs(root, names, callback){
    
    if(exiting){
        exiting = 0;
        return;
    }
    
    if (!root.endsWith('/')){
        root = root + '/';
    }
    
    publisher = spawn('mkdir', ['-p'].concat(names),{cwd: root, env: process.env, detached: true});
    
    console.log('Publisher: Setup new folders');

    publisher.on('error', function (err) {
        exiting = 1;
        console.log('Error creating Working Directories: '+err);
        publisherStatus.status = 'Error setting up working folders';
        publisherStatus.complete = -1;
        system.doSioEmit('update', publisherStatus);
        finished(true);
        publisher.kill('SIGTERM');
    });

    publisher.on('exit', function (code) {
        publisher = 0;
        if(exiting){
            exiting = 0;
            return;
        }
        callback();
    });
}

// Transcode Videos
function transcodeVideo(srcFiles, mType, vf, vr, vc, vb, ac, ab, destFile, completeInc, callback){
    
    if(exiting){
        exiting = 0;
        return;
    }
    
    var statusCompleteInitial = publisherStatus.complete;

    var args = [];
    if(srcFiles.length<1){
        publisherStatus.status = "Too few files. Cancelling";
        publisherStatus.complete = -1;
        system.doSioEmit('update', publisherStatus);
        finished(true);
        return;
    }
    for (var i = 0; i < srcFiles.length; i++) {
        args.push('-i');
        args.push(config.files_dir+srcFiles[i]);
    }
    if(srcFiles.length==1){
        if(mType == 'audio'){
            args.push('-vn');
        } else if(mType == 'video' && vf){
            args.push('-vf');
            args.push(vf);
        }
    } else {
        args.push('-filter_complex');
        var filter = '';
        if(mType == 'audio'){
            filter += 'concat=n='+srcFiles.length+':v=0:a=1[a]';
            args = args.concat([filter, '-map', '[a]']);
        } else if(mType == 'video'){
            if(vf){
                filter += 'concat=n='+srcFiles.length+':v=1:a=1[vx][a]; [vx]'+vf+'[v]';
            } else {
                filter += 'concat=n='+srcFiles.length+':v=1:a=1[v][a]';
            }
            args = args.concat([filter, '-map', '[v]', '-map', '[a]']);
        } else if(mType == 'dvd'){
            filter += 'concat=n='+srcFiles.length+':v=1:a=1[v][a]';
            args = args.concat([filter, '-map', '[v]', '-map', '[a]']);
        }
    }
    
    if(mType == 'audio'){
        args = args.concat(['-vn']);
        if(ac){args = args.concat(['-c:a', ac]);}
        if(ab){args = args.concat(['-b:a', ab]);}
        args = args.concat([destFile]);
    } else if(mType == 'video'){
        if(vr){args = args.concat(['-r',   vr]);}
        if(vc){args = args.concat(['-c:v', vc]);}
        if(vb){args = args.concat(['-b:v', vb]);}
        if(ac){args = args.concat(['-c:a', ac]);}
        if(ab){args = args.concat(['-b:a', ab]);}
        args = args.concat([destFile]);
    } else if(mType == 'dvd'){
        args = args.concat(['-target', vf, '-aspect', '16:9', destFile]);
    }
    
    publisher = spawn('ffmpeg', args, {cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Transcoding '+srcFiles.toString()+' '+args);
    publisherStatus.status = "Transcoding "+srcFiles.toString();
    publisherStatus.complete = statusCompleteInitial+(completeInc*0.1);
    system.doSioEmit('update', publisherStatus);
    var duration = 0;

    publisher.on('error', function (err) {
        exiting = 1;
        console.log('Error Transcoding '+srcFiles.toString()+': '+err);
        publisherStatus.status = 'Error Transcoding '+srcFiles.toString();
        publisherStatus.complete = -1;
        system.doSioEmit('update', publisherStatus);
        finished(true);
        publisher.kill('SIGTERM');
    });
    
    publisher.stderr.on('data', function (data) {
        //console.log(String(data));
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            var tIndex = output[i].indexOf('time=');
            if(tIndex>=0){
                //Parse time as date object from line
                var d = new Date("1970-01-01T"+output[i].match(/[0-9][0-9](:[0-9][0-9])+/g)+"Z");
                publisherStatus.status = "Transcoding "+srcFiles.toString()+": "+(Math.round(d.valueOf()*100/duration))+"%";
                publisherStatus.complete = statusCompleteInitial+((d.valueOf()/duration)*completeInc*0.9);
                continue;
            } else {
                tIndex = output[i].indexOf('Duration: ');
                if(tIndex>=0){
                    //Parse duration as date object from line
                    var d = new Date("1970-01-01T"+output[i].match(/[0-9][0-9](:[0-9][0-9])+/g)+"Z");
                    duration += d.valueOf();
                }
            }
        }
        system.doSioEmit('update', publisherStatus);
    });

    publisher.on('exit', function (code) {
        publisher = 0;
        if(exiting){
            exiting = 0;
            return;
        }
        callback();
    });
}

// Generate DVDAuthor XML
function generateXML(files, menuFile, callback){
    
    if(exiting){
        exiting = 0;
        return;
    }
    
    console.log('Configuring Disc');
    
    var dvd_xml =   '<dvdauthor dest="../disc_fs">\n'+
                    '    <vmgm>\n'+
                    '        <menus>\n'+
                    '            <video format="PAL" aspect="16:9"></video>\n'
    if(menuFile){
        dvd_xml +=  '            <pgc entry="title">\n'+
                    '                <button>jump title 1;</button>\n'+
                    '                <vob file="../menus/'+menuFile+'"></vob>\n'+
                    '            </pgc>\n'
    }
    dvd_xml +=      '        </menus>\n'+
                    '    </vmgm>\n'+
                    '    <titleset>\n'+
                    '        <titles>\n'+
                    '            <pgc>\n';

    for (var i = 0; i < files.length; i++) {
        dvd_xml +=  '                <vob file="'+files[i]+'"></vob>\n';
    }
    
    dvd_xml +=      '                <post>call vmgm menu;</post>\n'+
                    '            </pgc>\n'+
                    '        </titles>\n'+
                    '    </titleset>\n'+
                    '</dvdauthor>'
    
    fs.writeFile('publishing/disc_working/control.xml', dvd_xml, function (err) {
        if(exiting){
            exiting = 0;
            return;
        }
        if (err) {
            console.log('Error Generating Disc XML: '+err);
            publisherStatus.status = 'Error Generating Disc XML';
            publisherStatus.complete = -1;
            system.doSioEmit('update', publisherStatus);
            finished(true);
            return;
        }
        callback();
    });
    
}

// DVDAuthor TS
function generateTS(callback){
    
    if(exiting){
        exiting = 0;
        return;
    }
    
    publisher = spawn('dvdauthor', ['-x', 'control.xml'],{cwd: process.cwd()+'/publishing/disc_working', env: process.env, detached: true});
    
    console.log('Compiling Disc Contents');
    system.doSioEmit('update', publisherStatus);


    publisher.stdout.on('data', function (data) {
        console.log('error: '+data);
    });    
    
    publisher.stderr.on('data', function (data) {
        console.log('error: '+data);
    });
    
    publisher.on('error', function (err) {
        exiting = 1;
        console.log('Disc Creation Failed. Error Generating Titles: '+err);
        publisherStatus.status = 'Error Generating Disc Titles';
        publisherStatus.complete = -1;
        system.doSioEmit('update', publisherStatus);
        finished(true);
        publisher.kill('SIGTERM');
    });

    publisher.on('exit', function (code) {
        publisher = 0;
        if(exiting){
            exiting = 0;
            return;
        }
        callback();
    });
}

// Ensure Disc Ready
function prepOutput(callback){
    
    publisherTimer = 0;
    
    if(exiting){
        exiting = 0;
        return;
    }
    
    if(!config.burn_disc){
        callback();
        return;
    }
    
    var isoinfoOutput = "";
    publisher = spawn('isoinfo', ['-d', '-i', config.disc_drive],{cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Waiting for disc');
    
    publisher.stdout.on('data', function (data) {
        isoinfoOutput += "\n" + data;
    });
    
    publisher.stderr.on('data', function (data) {
        isoinfoOutput += "\n" + data;
    });
    
    publisher.on('exit', function (code) {
        publisher = 0;
        if(exiting){
            exiting = 0;
            return;
        }
        if(isoinfoOutput.indexOf("Seek error")<0){
            console.log('No blank disc found, please insert one & press resume.');
            publisherStatus.complete = -0.5
            publisherStatus.status = "No blank disc found, please insert one & press resume";
            system.doSioEmit('update', publisherStatus);
        } else {
            callback();
        }
    });
}

// Write Output to Disc
function writeOutput(completeInc, callback){
    
    if(exiting){
        exiting = 0;
        return;
    }
    
    var statusCompleteInitial = publisherStatus.complete;
    
    if(config.burn_disc){
        publisher = spawn('growisofs', ['-v','-Z',config.disc_drive,'-use-the-force-luke=noload','-V','DVD','-dvd-video','disc_fs/'],{cwd: process.cwd()+'/publishing', env: process.env, detached: true});
    } else {
        publisher = spawn('mkisofs', ['-v','-V','DVD','-dvd-video','-o','dvd.iso','disc_fs/'],{cwd: process.cwd()+'/publishing', env: process.env, detached: true});
    }
    
    
    console.log('Burning Disc');
    publisherStatus.status = "Burning Disc";
    statusCompleteInitial += (completeInc*0.1);
    publisherStatus.complete = statusCompleteInitial;
    system.doSioEmit('update', publisherStatus);

    publisher.on('error', function (err) {
        exiting = 1;
        console.log('Disc Creation Failed. Error Burning: '+err);
        publisherStatus.status = 'Error Burning Disc';
        publisherStatus.complete = -1;
        system.doSioEmit('update', publisherStatus);
        finished(true);
        publisher.kill('SIGTERM');
    });
    
    
    publisher.stderr.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            if(output[i].indexOf('done, estimate finish')>=0){
                var percentStr = output[i].match(/[0-9]+.*[0-9]*%/g)+'';
                var valStr = percentStr.substr(0, percentStr.length-1);
                var val = parseFloat(valStr);
                publisherStatus.status = "Burning Disc: "+percentStr;
                publisherStatus.complete = statusCompleteInitial+(val*completeInc*0.009);
            }
        }
        system.doSioEmit('update', publisherStatus);
    });

    publisher.on('exit', function (code) {
        publisher = 0;
        if(exiting){
            exiting = 0;
            return;
        }
        console.log('Buring Complete');
        callback();
    });
}


// Send to FTP Server
function uploadFile(file, server, username, password, completeInc, callback){
    
    if(exiting){
        exiting = 0;
        return;
    }
    
    var statusCompleteInitial = publisherStatus.complete;
    
    publisher = spawn('curl',['--progress-bar','-T',file, server, '--user', username+':'+password],{cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Uploading File');
    publisherStatus.status = "Uploading File";
    statusCompleteInitial += (completeInc*0.1);
    publisherStatus.complete = statusCompleteInitial;
    system.doSioEmit('update', publisherStatus);

    publisher.on('error', function (err) {
        exiting = 1;
        console.log('File Upload Failed:'+err);
        publisherStatus.status = 'Error Uploading File';
        publisherStatus.complete = -1;
        system.doSioEmit('update', publisherStatus);
        finished(true);
        publisher.kill('SIGTERM');
    });
    
    publisher.stderr.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            var percentStr = output[i].match(/[0-9]+.[0-9]+%/g)+'';
            var valStr = percentStr.substr(0, percentStr.length-1);
            var val = parseFloat(valStr);
            if(val){
                publisherStatus.status = "Uploading File: "+percentStr;
                publisherStatus.complete = statusCompleteInitial+(val*completeInc*0.009);
                console.log(percentStr+' '+val+' '+publisherStatus.complete);
            }
        }
        system.doSioEmit('update', publisherStatus);
    });

    publisher.on('exit', function (code) {
        publisher = 0;
        if(exiting){
            exiting = 0;
            return;
        }
        console.log('Upload Complete');
        callback();
    });
}


// Copy to destination path
function copyFile(file, destPath, destName, completeInc, callback){
    
    if(exiting){
        exiting = 0;
        return;
    }
    
    var statusCompleteInitial = publisherStatus.complete;
    
    if (!destPath.endsWith('/')){
        destPath += '/';
    }
    
    publisherStatus.locked = 1;
    
    publisher = spawn('curl',['--progress-bar','-o', destName, 'file://'+file],{cwd: destPath, env: process.env, detached: true});
    
    console.log('Copying File');
    publisherStatus.status = "Copying File";
    statusCompleteInitial += (completeInc*0.1);
    publisherStatus.complete = statusCompleteInitial;
    system.doSioEmit('update', publisherStatus);

    publisher.on('error', function (err) {
        exiting = 1;
        console.log('File Copy Failed:'+err);
        publisherStatus.status = 'Error Copying File';
        publisherStatus.complete = -1;
        system.doSioEmit('update', publisherStatus);
        finished(true);
        publisher.kill('SIGTERM');
    });
    
    publisher.stderr.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            var percentStr = output[i].match(/[0-9]+.[0-9]+%/g)+'';
            var valStr = percentStr.substr(0, percentStr.length-1);
            var val = parseFloat(valStr);
            if(val){
                publisherStatus.status = "Copying File: "+percentStr;
                publisherStatus.complete = statusCompleteInitial+(val*completeInc*0.009);
                console.log(percentStr+' '+val+' '+publisherStatus.complete);
            }
        }
        system.doSioEmit('update', publisherStatus);
    });

    publisher.on('exit', function (code) {
        publisher = 0;
        if(exiting){
            exiting = 0;
            return;
        }
        console.log('Copy Complete');
        callback();
    });
}


function reloadFlashDisks(){
    
    fs.readdir(config.flash_disk_dir, function (err, files) {
        if (err) {
            console.log('error listing removable disks');
            return;
        }
        removableDisks = files.slice();
        system.doSioEmit('removableDisks', removableDisks);
    });
}

//use df to get block device from path (eg if /home is on /dev/sda will return 'sda')
function getDev(path, callback){
    
    var dev = '';
    
    var df = spawn('df',['--no-sync','-k',path],{cwd: process.cwd(), env: process.env, detached: true});
    
    df.stdout.on('data', function (data) {
        var output = String(data).split("\n");
        var results = [];
        for (var i = 0; i < output.length; i++) {
            if(output[i].startsWith('/dev/')){
                dev = output[i].split(" ")[0].substr(5);
                break;
            }
        }
        if (callback != none){
            callback(dev);
        }
    });
    
}

//List files in the file_working directory ready to copy
function reloadFileTranscoded(callback) {
    fs.readdir(config.working_dir+'file_working/', function (err, files) {
        if (err) {
            console.log('Error getting transcoded files at '+config.working_dir+'file_working/ ' + err);
            publisherStatus.lastFileStatus = 0;
            publisherStatus.status = 'Error Reloading Previous Files';
            publisherStatus.complete = -1;
            system.doSioEmit('update', publisherStatus);
            system.setConfig('file_status', publisherStatus.lastFileStatus);
            finished(true);
            return;
        }
        var tcNames = files.slice();
        console.log('Reloading transcoded files');
        transcodedFiles = []
        for(var i=0; i<tcNames.length; i++){
            transcodedFiles[i] = config.working_dir+'file_working/'+tcNames[i];
            console.log(tcNames[i]);
        }
        callback();
    });
}

//run lsof, callback when no files open, otherwise repeat for # attempts
function checkFSClosed(path, attempts, timeout, callback){
    
    if (attempts <= 0){
        callback(false);
    }
    
    var open = false;
    
    var lsof = spawn('lsof',[path],{cwd: process.cwd(), env: process.env, detached: true});
    
    lsof.stdout.on('data', function (data) {
        if(data.length>1){
            open = true;
        }
    });
    
    lsof.on('close', function (code) {
        if (open) {
            setTimeout(function(){
                checkFSClosed(path, atempts-1, timeout, callback);
            }, timeout);
        } else {
            if (callback != none){
                callback(true);
            }
        }
        
    });
}

//run sync, callback when done
function doSync(callback){
    
    var sync = spawn('sync',[],{cwd: process.cwd(), env: process.env, detached: true});
    
    sync.on('close', function (code) {
        if (callback != none){
            callback();
        }
    });
    
}

// Check block fs stats to see if any inflight operations
function checkFSClear(dev, attempts, timeout, callback){
    
    if (attempts <= 0){
        callback(false);
    }
    
    var stat = spawn('cat',['/sys/block/'+dev+'/stat'],{cwd: process.cwd(), env: process.env, detached: true});
    
    fs.readFile('/sys/block/'+dev+'/stat', 'utf8', function(err, contents) {
        var output = String(contents).split(" ");
        if (output.length < 8) {
            return;
        } else {
            if(output[8] == '0'){
                callback(true);
            } else {
                setTimeout(function(){
                    clearFS(dev, attempts-1, timeout, callback);
                }, timeout);
            }
        }
    });
    
}

// run checkFSClosed, doSync, getDev & checkFSClear to determine if safe to remove disk
// callback with true if OK to remove, false if a timeout occurs.
function syncAndClear(path, callback){
    
    var cb_sync = function (success) {
        if (!success) {
            callback(false);
            return;
        }
        doSync(cb_gDev);
    };
    
    var cb_gDev = function () {
        getDev(path, cb_chkFsClr);
    };
    
    var cb_chkFsClr = function (dev) {
        checkFSClear(dev, 5, 4000, cb_done);
    };
    
    var cb_done = function (success) {
        callback(success);
        return;
    };
    
    checkFSClosed(path, 5, 4000, cb_sync);
    
}

// publishing done
function finished(reset) {
    publisherStatus.status = 0;
    publisherStatus.complete = 0;
    system.releaseResource('hdd');
    system.releaseResource('odd');
    if(reset){
        setTimeout(function(){
            system.doSioEmit('update', publisherStatus);
        }, 4000);
    }
}


// cancel
function stopPublisher(message){
    if(publisherTimer){
        clearTimeout(publisherTimer);
    }
    if(publisher){
        exiting = 1;
        publisher.kill('SIGTERM');
    }
    console.log('Publisher stopped: '+message);
    publisherStatus.status = message;
    publisherStatus.complete = -1;
    system.doSioEmit('update', publisherStatus);
    finished(true);
}


function publishDisc(sourceFNames, menuFName, resume){
    
    if(exiting){return;}
    
    if(publisher){
        system.doSioEmit('update', publisherStatus);
        console.log('Already publishing...');
        return;
    }
    
    if(!system.acquireResource('hdd')){
        system.doSioEmit('update', publisherStatus);
        console.log('Cannot publish while disk in use.');
        return;
    }
    
    if(!system.acquireResource('odd')){
        system.doSioEmit('update', publisherStatus);
        console.log('Cannot publish while optical drive in use.');
        return;
    }
    
    if (!resume) {
        publisherStatus.lastDiscStatus = 0;
        system.setConfig('disc_status', publisherStatus.lastDiscStatus);
    }
    
    var cb_finished = function () {
        publisherStatus.status = "Complete";
        publisherStatus.complete = 1;
        system.doSioEmit('update', publisherStatus);
        publisherStatus.lastDiscStatus = 3;
        system.setConfig('disc_status', publisherStatus.lastDiscStatus);
        finished(true);
        return;
    };
    
    var cb_writeOutput = function () {
        publisherStatus.status = "Ready to Burn";
        publisherStatus.complete = 0.69;
        system.doSioEmit('update', publisherStatus);
        writeOutput(0.3, cb_finished);
        return;
    };
    
    var cb_prepOutput = function () {
        publisherStatus.lastDiscStatus = 2;
        system.setConfig('disc_status', publisherStatus.lastDiscStatus);
        publisherStatus.status = "Waiting for disc";
        publisherStatus.complete = 0.68;
        system.doSioEmit('update', publisherStatus);
        prepOutput(cb_writeOutput);
        return;
    };
    
    var cb_generateTS = function () {
        publisherStatus.lastDiscStatus = 1;
        system.setConfig('disc_status', publisherStatus.lastDiscStatus);
        publisherStatus.status = "Compiling Disc Contents";
        publisherStatus.complete = 0.66;
        system.doSioEmit('update', publisherStatus);
        generateTS(cb_prepOutput);
        return;
    };
    
    var cb_generateXML = function () {
        publisherStatus.status = "Configuring Disc Structure";
        publisherStatus.complete = 0.64;
        system.doSioEmit('update', publisherStatus);
        generateXML(transcodedFiles, menuFName, cb_generateTS);
        return;
    };
    
    var cb_transcode = function () {
        publisherStatus.status = "Preparing files";
        publisherStatus.complete = 0.04;
        system.doSioEmit('update', publisherStatus);
        if (currentTcIndex < sourceFNames.length) {
            transcodedFiles.push('vid'+currentTcIndex+'.mpg');
            transcodeVideo([sourceFNames[currentTcIndex]], 'dvd', 'pal-dvd', '', '', '', '', '', 'publishing/disc_working/vid'+currentTcIndex+'.mpg', (0.6/sourceFNames.length), cb_transcode);
            currentTcIndex++;
        } else {
            cb_generateXML();
        }
        return;
    };
    
    var cb_setupDirs = function () {
        publisherStatus.status = "Initialising";
        publisherStatus.complete = 0.02;
        system.doSioEmit('update', publisherStatus);
        setupDirs('publishing/', ['disc_working','disc_fs'], cb_transcode);
        return;
    };
    
    switch(publisherStatus.lastDiscStatus) {
        case 1:
            generateTS(cb_prepOutput);
            break;
        case 2:
        case 3:
            prepOutput(cb_writeOutput);
            break;
        default:
            reloadAvailableFiles();
            // Check input files provided
            if (sourceFNames.length<1) {
                finished(true);
                return;
            }
            // validate input file names
            for (var i = 0; i < sourceFNames.length; i++) {
                if(publisherFiles.indexOf(sourceFNames[i])<0){
                    finished(true);
                    return;
                }
            }
            
            publisherStatus.status = "Clearing old files";
            system.doSioEmit('update', publisherStatus);
            currentTcIndex = 0;
            transcodedFiles = [];
            cleanDirs(config.working_dir, ['disc_working','disc_fs'], cb_setupDirs);
    }
    
}


function publishUpload(sourceFNames, destFName, transcode, protocol, server, username, password, resume){
    
    if(exiting){return;}
    
    if(publisher){
        system.doSioEmit('update', publisherStatus);
        console.log('Already publishing...');
        return;
    }
    
    if(!system.acquireResource('hdd')){
        system.doSioEmit('update', publisherStatus);
        console.log('Cannot publish while disk in use.');
        return;
    }
    
    if (!resume) {
        publisherStatus.lastFileStatus = 0;
        system.setConfig('file_status', publisherStatus.lastFileStatus);
    }
    
    var cb_finished = function () {
        publisherStatus.status = "Upload Complete.";
        publisherStatus.complete = 1;
        publisherStatus.lastFileStatus = 2;
        system.doSioEmit('update', publisherStatus);
        console.log('Complete.');
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        finished(true);
        return;
    };
    
    var cb_uploadFile = function () {
        publisherStatus.lastFileStatus = 1;
        publisherStatus.status = "Ready to upload";
        publisherStatus.complete = 0.64;
        system.doSioEmit('update', publisherStatus);
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        uploadFile(transcodedFiles[0], protocol+server, username, password, 0.3, cb_finished);
        return;
    };
    
    var cb_transcode = function () {
        publisherStatus.status = "Preparing files";
        publisherStatus.complete = 0.04;
        transcodedFiles.push(config.working_dir+'file_working/'+destFName+'.'+transcode.filetype);
        transcodeVideo(sourceFNames, transcode.mediatype, transcode.vFormat, transcode.vFRate, transcode.vCodec, transcode.vBitrate, transcode.aCodec, transcode.aBitrate, config.working_dir+'file_working/'+destFName+'.'+transcode.filetype, 0.6, cb_uploadFile);
        return;
    };
    
    var cb_uploadTranscoded = function () {
        publisherStatus.lastFileStatus = 1;
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        cb_uploadFile();
        return;
    };
    
    var cb_repeatUpload = function () {
        destFile = destFName;
        var ext = transcodedFiles[0].split('.');
        destFile += '.'+ext[ext.length-1];
        cb_uploadFile();
        return;
    };
    
    var cb_transcode = function () {
        publisherStatus.status = "Preparing files";
        publisherStatus.complete = 0.04;
        transcodedFiles.push(config.working_dir+'file_working/'+destFName+'.'+transcode.filetype);
        transcodeVideo(sourceFNames, transcode.mediatype, transcode.vFormat, transcode.vFRate, transcode.vCodec, transcode.vBitrate, transcode.aCodec, transcode.aBitrate, config.working_dir+'file_working/'+destFName+'.'+transcode.filetype, 0.6, cb_uploadTranscoded);
        return;
    };
    
    var cb_noTranscode = function () {
        publisherStatus.status = "Preparing to upload";
        publisherStatus.complete = 0.50;
        system.doSioEmit('update', publisherStatus);
        for (var i = 0; i < sourceFNames.length; i++) {
            transcodedFiles.push(config.files_dir+sourceFNames[i]);
        }
        cb_uploadFile();
        return;
    };
    
    var cb_setupDirs = function () {
        publisherStatus.status = "Initialising";
        publisherStatus.complete = 0.02;
        system.doSioEmit('update', publisherStatus);
        destFile = destFName;
        if (transcode.filetype) {
            destFile += '.'+transcode.filetype;
            setupDirs(config.working_dir, ['file_working'], cb_transcode);
        } else {
            var ext = transcodedFiles[0].split('.');
            destFile += '.'+ext[ext.length-1];
            setupDirs(config.working_dir, ['file_working'], cb_noTranscode);
        }
        return;
    };
    
    switch(publisherStatus.lastFileStatus) {
        case 1:
        case 2:
            reloadFileTranscoded(cb_repeatUpload);
            break;
        default:
            reloadAvailableFiles();
            // Check input files provided
            if (sourceFNames.length<1) {
                return;
            }
            // validate input file names
            for (var i = 0; i < sourceFNames.length; i++) {
                if(publisherFiles.indexOf(sourceFNames[i])<0){
                    return;
                }
            }
            
            publisherStatus.status = "Clearing old files";
            system.doSioEmit('update', publisherStatus);
            transcodedFiles = [];
            cleanDirs(config.working_dir, ['file_working'], cb_setupDirs);
    }
    
}


function publishRemovableDrive(sourceFNames, destFName, transcode, drivePath, resume){
    
    if(exiting){return;}
    
    if(publisher){
        system.doSioEmit('update', publisherStatus);
        console.log('Already publishing...');
        return;
    }
    
    if(recorderStatus.recording){
        console.log('Recording; cannot publish.');
        return;
    }
    
    if (!resume) {
        publisherStatus.lastFileStatus = 0;
        system.setConfig('file_status', publisherStatus.lastFileStatus);
    }
    
    var cb_finished = function () {
        publisherStatus.status = "Complete. It is now safe to remove the drive.";
        publisherStatus.complete = 1;
        publisherStatus.lastFileStatus = 2;
        system.doSioEmit('update', publisherStatus);
        console.log('Complete. Safe to remove.');
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        finished(true);
        return;
    };
    
    var cb_syncAndClear2 = function (success) {
        if(success){
            cb_finished();
        } else {
            syncAndClear(drivePath, cb_syncAndClear2);
        }
        return;
    };
    
    var cb_syncAndClear = function () {
        console.log('Waiting for drive');
        publisherStatus.status = "Waiting for drive";
        publisherStatus.complete = 0.95;
        system.doSioEmit('update', publisherStatus);
        syncAndClear(drivePath, cb_syncAndClear2);
        return;
    };
    
    var cb_copyFile = function () {
        publisherStatus.lastFileStatus = 1;
        publisherStatus.status = "Ready to copy";
        publisherStatus.complete = 0.64;
        system.doSioEmit('update', publisherStatus);
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        copyFile(transcodedFiles[0], drivePath, destFile, 0.3, cb_finished);
        return;
    };
    
    var cb_copyTranscoded = function () {
        publisherStatus.lastFileStatus = 1;
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        cb_copyFile();
        return;
    };
    
    var cb_repeatCopy = function () {
        destFile = destFName;
        var ext = transcodedFiles[0].split('.');
        destFile += '.'+ext[ext.length-1];
        cb_copyFile();
        return;
    };
    
    var cb_transcode = function () {
        publisherStatus.status = "Preparing files";
        publisherStatus.complete = 0.04;
        transcodedFiles.push(config.working_dir+'file_working/'+destFName+'.'+transcode.filetype);
        transcodeVideo(sourceFNames, transcode.mediatype, transcode.vFormat, transcode.vFRate, transcode.vCodec, transcode.vBitrate, transcode.aCodec, transcode.aBitrate, config.working_dir+'file_working/'+destFName+'.'+transcode.filetype, 0.6, cb_copyTranscoded);
        return;
    };
    
    var cb_noTranscode = function () {
        publisherStatus.status = "Preparing to copy";
        publisherStatus.complete = 0.50;
        system.doSioEmit('update', publisherStatus);
        for (var i = 0; i < sourceFNames.length; i++) {
            transcodedFiles.push(config.files_dir+sourceFNames[i]);
        }
        cb_copyFile();
        return;
    };
    
    var cb_setupDirs = function () {
        publisherStatus.status = "Initialising";
        publisherStatus.complete = 0.02;
        system.doSioEmit('update', publisherStatus);
        destFile = destFName;
        if (transcode.filetype) {
            destFile += '.'+transcode.filetype;
            setupDirs(config.working_dir, ['file_working'], cb_transcode);
        } else {
            var ext = transcodedFiles[0].split('.');
            destFile += '.'+ext[ext.length-1];
            setupDirs(config.working_dir, ['file_working'], cb_noTranscode);
        }
        return;
    };
    
    switch(publisherStatus.lastFileStatus) {
        case 1:
        case 2:
            reloadFileTranscoded(cb_repeatCopy);
            break;
        default:
            reloadAvailableFiles();
            // Check input files provided
            if (sourceFNames.length<1) {
                finished(true);
                return;
            }
            // validate input file names
            for (var i = 0; i < sourceFNames.length; i++) {
                if(publisherFiles.indexOf(sourceFNames[i])<0){
                    finished(true);
                    return;
                }
            }
            
            publisherStatus.status = "Clearing old files";
            system.doSioEmit('update', publisherStatus);
            transcodedFiles = [];
            cleanDirs(config.working_dir, ['file_working'], cb_setupDirs);
    }
    
}

