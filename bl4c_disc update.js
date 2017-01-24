var currentTcIndex = 0;
var transcodedFiles = [];


    

// Clean Working Directories
function cleanDirs(root, names, callback){
    
    if(exiting){return;}

    if (!root.endsWith('/')){
        root = root + '/';
    }
    
    for (var i = 0; i < names.length; i++) {
        names[i] = '"'+root+names[i]+'"';
    }
    
    publisher = spawn('rm', ['-rf'].concat(names),{cwd: process.cwd(), env: process.env, detached: true});
    
    publisherStatus.status = "Initialising";
    publisherStatus.complete = 0.01;
    io.emit('publisherUpdate', publisherStatus);

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
        publisherStatus.complete = 0.02;
        io.emit('publisherUpdate', publisherStatus);
        //setupDirs();
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
        names[i] = '"'+root+names[i]+'"';
    }
    
    publisher = spawn('mkdir', ['-p'].concat(names),{cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Initialising');
    publisherStatus.status = "Initialising";
    publisherStatus.complete = 0.03;
    io.emit('publisherUpdate', publisherStatus);

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
        publisherStatus.complete = 0.05;
        io.emit('publisherUpdate', publisherStatus);
        //transcodeVideos(0);
        callback();
    });
}

// Transcode Videos
function transcodeVideo(srcFiles, vc, vb, ac, ab, destFile, callback){
    
    if(exiting){return;}

    var inputArgs = [];
    if(srcFiles.length<1){
        publisherStatus.status = "Too few files. Cancelling";
        publisherStatus.complete = 1;
        io.emit('publisherUpdate', publisherStatus);
        setTimeout(function(){
                publisherStatus.status = 0;
                publisherStatus.complete = 0;
                io.emit('publisherUpdate', publisherStatus);
        }, 4000);
        return;
    } else if(srcFiles.length==1){
        inputArgs = ['-i', srcFiles[0]];
    } else {
        for (var i = 0; i < srcFiles.length; i++) {
            inputArgs.push('-i');
            inputArgs.push(srcFiles[i]);
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
    
    console.log('Transcoding '+srcFiles[0]);
    publisherStatus.status = "Transcoding "+srcFiles[0];
    publisherStatus.complete = publisherStatus.complete + 0.05;
    io.emit('publisherUpdate', publisherStatus);
    var duration = '00:00:00';

    publisher.on('error', function (err) {
        console.log('Error Transcoding File: '+err);
        publisher.kill('SIGTERM');
    });
    
    publisher.stderr.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            var tIndex = output[i].indexOf('time=');
            if(tIndex>=0){
                publisherStatus.status = "Transcoding "srcFiles[0]": "+output[i].substring(tIndex+5,tIndex+13)+"/"+duration;
                continue;
            }
            tIndex = output[i].indexOf('Duration: ');
            if(tIndex>=0){
                duration = output[i].substring(tIndex+10,tIndex+18);
            }
        }
        io.emit('publisherUpdate', publisherStatus);
    });

    publisher.on('exit', function (code) {
        publisher.kill('SIGKILL');
        publisher = 0;
        if(exiting){
            return;
        }
        io.emit('publisherUpdate', publisherStatus);
        callback();
    });
}

// Generate DVDAuthor XML
function generateXML(files, menuFile, callback){
    
    if(exiting){return;}
    
    console.log('Configuring Disc');
    publisherStatus.status = "Configuring Disc";
    publisherStatus.complete = 0.4;
    io.emit('publisherUpdate', publisherStatus);
    
    var dvd_xml =  '<dvdauthor dest="../disc_fs">\n'+
                    '    <vmgm>\n'+
                    '        <menus>\n'+
                    '            <video format="PAL" aspect="16:9"></video>\n'
    if(menuFile){
        dvd_xml += '            <pgc entry="title">\n'+
                    '                <button>jump title 1;</button>\n'+
                    '                <vob file="../menus/'+menuFile+'"></vob>\n'+
                    '            </pgc>\n'
    }
    dvd_xml +=     '        </menus>\n'+
                    '    </vmgm>\n'+
                    '    <titleset>\n'+
                    '        <titles>\n'+
                    '            <pgc>\n';

    for (var i = 0; i < files.length; i++) {
        dvd_xml += '                <vob file="'+files[i]+'"></vob>\n';
    }
    
    dvd_xml +=     '                <post>call vmgm menu;</post>\n'+
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
    io.emit('publisherUpdate', publisherStatus);


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
        io.emit('publisherUpdate', publisherStatus);
        callback();
    });
}

// Ensure Disc Ready
function prepOutput(callback){
    
    publisherTimer = 0;
    
    if(exiting){return;}
    
    if(!discOutput){
        writeOutput();
        return;
    }
    
    var isoinfoOutput = "";
    publisher = spawn('isoinfo', ['-d', '-i', discDrive],{cwd: process.cwd(), env: process.env, detached: true});
    
    console.log('Waiting for disc');
    publisherStatus.status = "Waiting for disc";
    publisherStatus.complete = 0.49;
    io.emit('publisherUpdate', publisherStatus);
    
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
            io.emit('publisherUpdate', publisherStatus);
        } else {
            callback();
        }
    });
}

// Write Output to Disc
function writeOutput(callback){
    
    if(exiting){return;}
    
    if(discOutput){
        publisher = spawn('growisofs', ['-v','-Z',discDrive,'-use-the-force-luke=noload','-V','DVD','-dvd-video','disc_fs/'],{cwd: process.cwd()+'/publishing', env: process.env, detached: true});
    } else {
        publisher = spawn('mkisofs', ['-v','-V','DVD','-dvd-video','-o','dvd.iso','disc_fs/'],{cwd: process.cwd()+'/publishing', env: process.env, detached: true});
    }
    
    
    console.log('Burning Disc');
    publisherStatus.status = "Burning Disc";
    publisherStatus.complete = 0.5;
    io.emit('publisherUpdate', publisherStatus);

    publisher.on('error', function (err) {
        console.log('Disc Creation Failed:'+err);
        publisher.kill('SIGTERM');
    });
    
    publisher.stderr.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            if(output[i].indexOf('done, estimate finish')>=0){
                publisherStatus.status = "Burning Disc: "+output[i];
            }
        }
        io.emit('publisherUpdate', publisherStatus);
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
        io.emit('publisherUpdate', publisherStatus);
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
    io.emit('publisherUpdate', publisherStatus);

    publisher.on('error', function (err) {
        console.log('File Upload Failed:'+err);
        publisher.kill('SIGTERM');
    });
    
    publisher.stderr.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            publisherStatus.status = "Uploading File: "+output[i]+"&#37;";
        }
        io.emit('publisherUpdate', publisherStatus);
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
        io.emit('publisherUpdate', publisherStatus);
        callback();
    });
}


function finished(success) {
    if(success){
        setTimeout(function(){
            publisherStatus.status = 0;
            publisherStatus.complete = 0;
            io.emit('publisherUpdate', publisherStatus);
        }, 4000);
    }
}



function publishDisc(sourceFNames, menuFName, resume){
    
    if(exiting){return;}
    
    if(publisher){
        io.emit('publisherUpdate', publisherStatus);
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
        config.set('publisher:disc_status', publisherStatus.lastDiscStatus);
        config.save();
    }
    
    var cb_finished = function () {
        publisherStatus.lastDiscStatus = 3;
        config.set('publisher:disc_status', publisherStatus.lastDiscStatus);
        config.save();
        finished(true);
        return;
    };
    
    var cb_writeOutput = function () {
        writeOutput(cb_finished);
        return;
    };
    
    var cb_prepOutput = function () {
        publisherStatus.lastDiscStatus = 2;
        config.set('publisher:disc_status', publisherStatus.lastDiscStatus);
        config.save();
        prepOutput(cb_writeOutput);
        return;
    };
    
    var cb_generateTS = function () {
        publisherStatus.lastDiscStatus = 1;
        config.set('publisher:disc_status', publisherStatus.lastDiscStatus);
        config.save();
        generateTS(cb_prepOutput);
        return;
    };
    
    var cb_generateXML = function () {
        generateXML(transcodedFiles, menuFName, cb_generateTS);
        return;
    };
    
    var cb_transcode = function () {
        if (currentTcIndex < sourceFNames.length) {
            transcodeVideo([sourceFNames[currentTcIndex]], 'pal-dvd', '', '', '', 'publishing/disc_working/vid'+currentTcIndex+'.mpg', cb_transcode);
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
            reloadRecordings();
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


function publishFTP(sourceFNames, destFName, server, username, password, resume){
    
    if(exiting){return;}
    
    if(publisher){
        io.emit('publisherUpdate', publisherStatus);
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
        config.set('publisher:file_status', publisherStatus.lastFileStatus);
        config.save();
    }
    
    var cb_finished = function () {
        publisherStatus.lastFileStatus = 2;
        config.set('publisher:file_status', publisherStatus.lastFileStatus);
        config.save();
        finished(true);
        return;
    };
    
    var cb_uploadFile = function () {
        publisherStatus.lastFileStatus = 1;
        config.set('publisher:file_status', publisherStatus.lastFileStatus);
        config.save();
        uploadFile(transcodedFiles[0], server, username, password, cb_finished);
        return;
    };
    
    var cb_transcode = function () {
        transcodeVideo(sourceFNames, 'libx264', '6000k', 'aac', '160k', 'publishing/file_working/'+destFName+'.mp4', cb_uploadFile);
        transcodedFiles.push('publishing/file_working/'+destFName+'.mp4');
        return;
    };
    
    var cb_setupDirs = function () {
        setupDirs('publishing/', ['file_working'], cb_transcode);
        return;
    };
    
    switch(publisherStatus.lastFileStatus) {
        case 1:
        case 2:
            uploadFile(callback);
            break;
        default:
            reloadRecordings();
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
