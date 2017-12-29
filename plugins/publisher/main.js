var publisher = 0;
var publisherTimer = 0;
var publisherStatus = {status:0,complete:0,locked:0,lastDiscStatus:0,lastFileStatus:0};
var publisherFiles = [];
var currentTcIndex = 0;
var transcodedFiles = [];
var recorderStatus = {connected:0,recording:0,remainingSpace:'Remaining&nbsp;Space&nbsp;Unavailable'};
var spawn  = require('child_process').spawn;
var system = null;
var sio_hooks = [];

var config = {
        "files_dir": "/home/user/recordings/"
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
    
    publisherStatus.lastDiscStatus = config.disc_status;
    publisherStatus.lastFileStatus = config.file_status;
    
    system.registerSioEvent('connected', function(){
        system.doSioEmit('update', publisherStatus);
    });
    
    for(var i=0; i<sio_hooks.length; i++){
       system.registerSioEvent(sio_hooks[i].event, sio_hooks[i].callback); 
    }
    
    reloadAvailableFiles();
    
}

exports.unload = function () {
    stopPublisher("Shutting Down");
}

exports.notify = function (signalName, value) {
    //Update status if publishing
    if(signalName == "recorder_status"){
        recorderStatus = value;
    }
}

sio_hooks.push({event:'getFileList', callback:function(){
    reloadAvailableFiles();
}});
 
sio_hooks.push({event:'burnDisc', callback:function(discInfo){
    publishDisc(discInfo.sourceFNames, discInfo.menu, discInfo.resume);
}});

sio_hooks.push({event:'uploadFile', callback:function(uploadInfo){
    publishFTP(uploadInfo.sourceFNames, uploadInfo.destFName, uploadInfo.transcode, uploadInfo.server, uploadInfo.username, uploadInfo.password, uploadInfo.resume);
}});

sio_hooks.push({event:'copyFile', callback:function(copyInfo){
    publishFTP(copyInfo.sourceFNames, copyInfo.destFName, copyInfo.transcode, copyInfo.path, copyInfo.resume);
}});

sio_hooks.push({event:'cancelPublish', callback:function(){
    stopPublisher("Cancelled by operator");
}});


//TODO
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
    
    if(exiting){return;}

    if (!root.endsWith('/')){
        root = root + '/';
    }
    
    for (var i = 0; i < names.length; i++) {
        names[i] = root+names[i];
    }
    
    publisher = spawn('rm', ['-rf'].concat(names),{cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Publisher: Remove old files');
    publisherStatus.status = "Clearing old files";
    system.doSioEmit('update', publisherStatus);

    publisher.on('error', function (err) {
        console.log('Error cleaning Working Directories: '+err);
        publisher.kill('SIGTERM');
    });

    publisher.on('exit', function (code) {
        publisher.kill('SIGKILL');
        publisher = 0;
        if(exiting){
            return;
        }
        callback();
    });
    
}

// Create Working Directories
function setupDirs(root, names, callback){
    
    if(exiting){return;}
    
    if (!root.endsWith('/')){
        root = root + '/';
    }
    
    for (var i = 0; i < names.length; i++) {
        names[i] = root+names[i];
    }
    
    publisher = spawn('mkdir', ['-p'].concat(names),{cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Publisher: Setup new folders');
    publisherStatus.status = "Initialising";
    system.doSioEmit('update', publisherStatus);

    publisher.on('error', function (err) {
        console.log('Error creating Working Directories: '+err);
        publisher.kill('SIGTERM');
    });

    publisher.on('exit', function (code) {
        publisher.kill('SIGKILL');
        publisher = 0;
        if(exiting){
            return;
        }
        callback();
    });
}

// Transcode Videos
function transcodeVideo(srcFiles, vc, vb, ac, ab, destFile, completeInc, callback){
    
    if(exiting){return;}
    
    var statusCompleteInitial = publisherStatus.complete;

    var inputArgs = [];
    if(srcFiles.length<1){
        publisherStatus.status = "Too few files. Cancelling";
        publisherStatus.complete = 1;
        system.doSioEmit('update', publisherStatus);
        setTimeout(function(){
                publisherStatus.status = 0;
                publisherStatus.complete = 0;
                system.doSioEmit('update', publisherStatus);
        }, 4000);
        return;
    } else if(srcFiles.length==1){
        inputArgs = ['-i', recordDir+srcFiles[0]];
    } else {
        for (var i = 0; i < srcFiles.length; i++) {
            inputArgs.push('-i');
            inputArgs.push(recordDir+srcFiles[i]);
        }
        inputArgs.push('-filter_complex');
        var concats = '';
        for (var i = 0; i < srcFiles.length; i++) {
            concats = concats + '[i:0] [i:1] ';
        }
        concats = concats + 'concat=n='+str(i)+':v=1:a=1 [v] [a]';
        inputArgs.push(concats);
        inputArgs.push('-map');
        inputArgs.push("'[v]'");
        inputArgs.push('-map');
        inputArgs.push("'[a]'");
    }
    
    var args = [];
    if(vc.endsWith('dvd')){
        args = inputArgs.concat(['-target', vc, '-aspect', '16:9', destFile]);
    } else {
        args = inputArgs.concat(['-c:v', vc, '-b:v', vb, '-c:a', ac, '-b:a', ab, destFile]);
    }
    
    publisher = spawn('ffmpeg', args, {cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Transcoding '+srcFiles.toString()+' '+args);
    publisherStatus.status = "Transcoding "+srcFiles.toString();
    publisherStatus.complete = statusCompleteInitial+(completeInc*0.1);
    system.doSioEmit('update', publisherStatus);
    var duration = 0;

    publisher.on('error', function (err) {
        console.log('Error Transcoding File: '+err);
        publisher.kill('SIGTERM');
    });
    
    publisher.stderr.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            var tIndex = output[i].indexOf('time=');
            if(tIndex>=0){
                //Parse time as date object from line
                var d = new Date("T"+output[i].match(/[0-9][0-9](:[0-9][0-9])+/g)+"Z");
                publisherStatus.status = "Transcoding "+srcFiles.toString()+": "+(d.valueOf()*100/duration)+"%";
                publisherStatus.complete = statusCompleteInitial+((d.valueOf()/duration)*completeInc*0.9);
                continue;
            } else {
                tIndex = output[i].indexOf('Duration: ');
                if(tIndex>=0){
                    //Parse duration as date object from line
                    var d = new Date("T"+output[i].match(/[0-9][0-9](:[0-9][0-9])+/g)+"Z");
                    duration += d.valueOf();
                }
            }
        }
        system.doSioEmit('update', publisherStatus);
    });

    publisher.on('exit', function (code) {
        publisher.kill('SIGKILL');
        publisher = 0;
        if(exiting){
            return;
        }
        system.doSioEmit('update', publisherStatus);
        callback();
    });
}

// Generate DVDAuthor XML
function generateXML(files, menuFile, callback){
    
    if(exiting){return;}
    
    console.log('Configuring Disc');
    publisherStatus.status = "Configuring Disc";
    publisherStatus.complete = 0.4;
    system.doSioEmit('update', publisherStatus);
    
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
        if (err) {
    console.log(err);
            return;
        }
        callback();
    });
    
}

// DVDAuthor TS
function generateTS(callback){
    
    if(exiting){return;}
    
    publisher = spawn('dvdauthor', ['-x', 'control.xml'],{cwd: process.cwd()+'/publishing/disc_working', env: process.env, detached: true});
    
    console.log('Compiling Disc Contents');
    publisherStatus.status = "Compiling Disc Contents";
    publisherStatus.complete = 0.4;
    system.doSioEmit('update', publisherStatus);


    publisher.stdout.on('data', function (data) {
        console.log('error: '+data);
    });    
    
    publisher.stderr.on('data', function (data) {
        console.log('error: '+data);
    });
    
    publisher.on('error', function (err) {
        console.log('Disc Creation Failed. Error Generating Titles: '+err);
        publisher.kill('SIGTERM');
    });

    publisher.on('exit', function (code) {
        publisher.kill('SIGKILL');
        publisher = 0;
        if(exiting){
            return;
        }
        publisherStatus.complete = 0.45;
        system.doSioEmit('update', publisherStatus);
        callback();
    });
}

// Ensure Disc Ready
function prepOutput(callback){
    
    publisherTimer = 0;
    
    if(exiting){return;}
    
    if(!config.burn_disc){
        callback();
        return;
    }
    
    var isoinfoOutput = "";
    publisher = spawn('isoinfo', ['-d', '-i', config.disc_drive],{cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Waiting for disc');
    publisherStatus.status = "Waiting for disc";
    publisherStatus.complete = 0.49;
    system.doSioEmit('update', publisherStatus);
    
    publisher.stdout.on('data', function (data) {
        isoinfoOutput += "\n" + data;
    });
    
    publisher.stderr.on('data', function (data) {
        isoinfoOutput += "\n" + data;
    });
    
    publisher.on('exit', function (code) {
        publisher.kill('SIGKILL');
        publisher = 0;
        if(exiting){
            return;
        }
        if(isoinfoOutput.indexOf("Seek error")<0){
            console.log('No blank disc found, please insert one & press resume.');
            publisherStatus.status = "No blank disc found, please insert one & press resume";
            publisherStatus.complete = 0.49;
            system.doSioEmit('update', publisherStatus);
        } else {
            callback();
        }
    });
}

// Write Output to Disc
function writeOutput(completeInc, callback){
    
    if(exiting){return;}
    
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
        console.log('Disc Creation Failed:'+err);
        publisher.kill('SIGTERM');
    });
    
    
    publisher.stderr.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            if(output[i].indexOf('done, estimate finish')>=0){
                var percentStr = output[i].match(/[0-9]+.[0-9]*%/g)+'';
                var valStr = percentStr.substr(0, percentStr.length-1);
                var val = parseFloat(valStr);
                publisherStatus.status = "Burning Disc: "+percentStr;
                publisherStatus.complete = statusCompleteInitial+(val*completeInc*0.009);
            }
        }
        system.doSioEmit('update', publisherStatus);
    });

    publisher.on('exit', function (code) {
        publisher.kill('SIGKILL');
        publisher = 0;
        if(exiting){
            return;
        }
        console.log('Complete');
        publisherStatus.status = "Complete";
        publisherStatus.complete = 1;
        system.doSioEmit('update', publisherStatus);
        callback();
    });
}


// Send to FTP Server
function uploadFile(file, server, username, password, callback){
    
    if(exiting){return;}
    
    publisher = spawn('curl',['-T',file, (server.indexOf('ftp://')==0 ? server : 'ftp://'+server), '--user', username+':'+password],{cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Uploading File');
    publisherStatus.status = "Uploading File";
    publisherStatus.complete = 0.5;
    system.doSioEmit('update', publisherStatus);

    publisher.on('error', function (err) {
        console.log('File Upload Failed:'+err);
        publisher.kill('SIGTERM');
    });
    
    publisher.stderr.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            publisherStatus.status = "Uploading File: "+output[i]+"&#37;";
        }
        system.doSioEmit('update', publisherStatus);
    });

    publisher.on('exit', function (code) {
        publisher.kill('SIGKILL');
        publisher = 0;
        if(exiting){
            return;
        }
        console.log('Complete');
        publisherStatus.status = "Complete";
        publisherStatus.complete = 1;
        system.doSioEmit('update', publisherStatus);
        callback();
    });
}


// Copy to destination path
function copyFile(file, path, callback){
    
    if(exiting){return;}
    
    var fullPath = config.flash_disk_dir;
    if (!fullPath.endsWith('/')){
        fullPath = fullPath + '/';
    }
    fullPath = fullPath + path;
    
    publisherStatus.locked = 1;
    
    publisher = spawn('curl',['-o', fullPath, 'file://'+process.cwd()+'/'+file],{cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Copying File');
    publisherStatus.status = "Copying File";
    publisherStatus.complete = 0.5;
    system.doSioEmit('update', publisherStatus);

    publisher.on('error', function (err) {
        console.log('File Copy Failed:'+err);
        publisher.kill('SIGTERM');
    });
    
    publisher.stderr.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            publisherStatus.status = "Uploading File: "+output[i]+"&#37;";
        }
        system.doSioEmit('update', publisherStatus);
    });

    publisher.on('exit', function (code) {
        publisher.kill('SIGKILL');
        publisher = 0;
        if(exiting){
            return;
        }
        console.log('Complete');
        publisherStatus.status = "Complete";
        publisherStatus.complete = 1;
        system.doSioEmit('update', publisherStatus);
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
                publisherStatus.locked = 0;
                system.doSioEmit('update', publisherStatus);
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
    if(reset){
        setTimeout(function(){
            publisherStatus.status = 0;
            publisherStatus.complete = 0;
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
        exiting = 0;
    }
    console.log('Publisher stopped: '+message);
    publisherStatus.status = message;
    publisherStatus.complete = 1;
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
    
    if(recorderStatus.recording){
        io.emit('recorderUpdate', recorderStatus);
        console.log('Recording; cannot publish.');
        return;
    }
    
    if (!resume) {
        publisherStatus.lastDiscStatus = 0;
        system.setConfig('disc_status', publisherStatus.lastDiscStatus);
        config.save();
    }
    
    var cb_finished = function () {
        publisherStatus.lastDiscStatus = 3;
        system.setConfig('disc_status', publisherStatus.lastDiscStatus);
        finished(true);
        return;
    };
    
    var cb_writeOutput = function () {
        writeOutput(0.6, cb_finished);
        return;
    };
    
    var cb_prepOutput = function () {
        publisherStatus.lastDiscStatus = 2;
        system.setConfig('disc_status', publisherStatus.lastDiscStatus);
        prepOutput(cb_writeOutput);
        return;
    };
    
    var cb_generateTS = function () {
        publisherStatus.lastDiscStatus = 1;
        system.setConfig('disc_status', publisherStatus.lastDiscStatus);
        generateTS(cb_prepOutput);
        return;
    };
    
    var cb_generateXML = function () {
        generateXML(transcodedFiles, menuFName, cb_generateTS);
        return;
    };
    
    var cb_transcode = function () {
        if (currentTcIndex < sourceFNames.length) {
            transcodeVideo([sourceFNames[currentTcIndex]], 'pal-dvd', '', '', '', 'publishing/disc_working/vid'+currentTcIndex+'.mpg', (0.5/sourceFNames.length), cb_transcode);
            transcodedFiles.push('vid'+currentTcIndex+'.mpg');
            currentTcIndex++;
        } else {
            cb_generateXML();
        }
        return;
    };
    
    var cb_setupDirs = function () {
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
            // validate input file names
            for (var i = 0; i < sourceFNames.length; i++) {
                if(publisherFiles.indexOf(sourceFNames[i])<0){
                    return;
                }
            }
            currentTcIndex = 0;
            transcodedFiles = [];
            cleanDirs('publishing/', ['disc_working','disc_fs'], cb_setupDirs);
    }
    
}


function publishFTP(sourceFNames, destFName, transcode, server, username, password, resume){
    
    if(exiting){return;}
    
    if(publisher){
        system.doSioEmit('update', publisherStatus);
        console.log('Already publishing...');
        return;
    }
    
    if(recorderStatus.recording){
        io.emit('recorderUpdate', recorderStatus);
        console.log('Recording; cannot publish.');
        return;
    }
    
    if (!resume) {
        publisherStatus.lastFileStatus = 0;
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        config.save();
    }
    
    var cb_finished = function () {
        publisherStatus.lastFileStatus = 2;
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        finished(true);
        return;
    };
    
    var cb_uploadFile = function () {
        publisherStatus.lastFileStatus = 1;
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        uploadFile(transcodedFiles[0], server, username, password, cb_finished);
        return;
    };
    
    var cb_transcode = function () {
        transcodeVideo(sourceFNames, 'libx264', '6000k', 'aac', '160k', 'publishing/file_working/'+destFName+'.mp4', 0.5, cb_uploadFile);
        transcodedFiles.push('publishing/file_working/'+destFName+'.mp4');
        return;
    };
    
    var cb_noTranscode = function () {
        for (var i = 0; i < sourceFNames.length; i++) {
            transcodedFiles.push(recordDir+sourceFNames[i]);
        }
        cb_uploadFile();
        return;
    };
    
    var cb_setupDirs = function () {
        if (transcode) {
            setupDirs('publishing/', ['file_working'], cb_transcode);
        } else {
            setupDirs('publishing/', ['file_working'], cb_noTranscode);
        }
        return;
    };
    
    switch(publisherStatus.lastFileStatus) {
        case 1:
        case 2:
            uploadFile(cb_finished);
            break;
        default:
            reloadAvailableFiles();
            // validate input file names
            for (var i = 0; i < sourceFNames.length; i++) {
                if(publisherFiles.indexOf(sourceFNames[i])<0){
                    return;
                }
            }
            transcodedFiles = [];
            cleanDirs('publishing/', ['file_working'], cb_setupDirs);
    }
    
}


function publishRemovableDrive(sourceFNames, destFName, transcode, path, resume){
    
    if(exiting){return;}
    
    if(publisher){
        system.doSioEmit('update', publisherStatus);
        console.log('Already publishing...');
        return;
    }
    
    if(recorderStatus.recording){
        io.emit('recorderUpdate', recorderStatus);
        console.log('Recording; cannot publish.');
        return;
    }
    
    if (!resume) {
        publisherStatus.lastFileStatus = 0;
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        config.save();
    }
    
    var cb_finished = function () {
        publisherStatus.lastFileStatus = 2;
        console.log('Complete. Safe to remove.');
        publisherStatus.status = "Complete. It is now safe to remove the drive.";
        publisherStatus.complete = 0.9;
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        finished(true);
        return;
    };
    
    var cb_syncAndClear2 = function (success) {
        if(success){
            cb_finished();
        } else {
            syncAndClear(path, cb_syncAndClear2);
        }
        return;
    };
    
    var cb_syncAndClear = function () {
        console.log('Waiting for drive');
        publisherStatus.status = "Waiting for drive";
        publisherStatus.complete = 0.9;
        system.doSioEmit('update', publisherStatus);
        syncAndClear(path, cb_syncAndClear2);
        return;
    };
    
    var cb_copyFile = function () {
        publisherStatus.lastFileStatus = 1;
        system.setConfig('file_status', publisherStatus.lastFileStatus);
        copyFile(transcodedFiles[0], server, username, password, cb_finished);
        return;
    };
    
    var cb_transcode = function () {
        transcodeVideo(sourceFNames, 'libx264', '6000k', 'aac', '160k', 'publishing/file_working/'+destFName+'.mp4', 0.5, cb_copyFile);
        transcodedFiles.push('publishing/file_working/'+destFName+'.mp4');
        return;
    };
    
    var cb_noTranscode = function () {
        for (var i = 0; i < sourceFNames.length; i++) {
            transcodedFiles.push(recordDir+sourceFNames[i]);
        }
        cb_copyFile();
        return;
    };
    
    var cb_setupDirs = function () {
        if (transcode) {
            setupDirs('publishing/', ['file_working'], cb_transcode);
        } else {
            setupDirs('publishing/', ['file_working'], cb_noTranscode);
        }
        return;
    };
    
    switch(publisherStatus.lastFileStatus) {
        case 1:
        case 2:
            copyFile(cb_finished);
            break;
        default:
            reloadAvailableFiles();
            // validate input file names
            for (var i = 0; i < sourceFNames.length; i++) {
                if(publisherFiles.indexOf(sourceFNames[i])<0){
                    return;
                }
            }
            transcodedFiles = [];
            cleanDirs('publishing/', ['file_working'], cb_setupDirs);
    }
    
}

