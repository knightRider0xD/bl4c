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
    
    /*
    var cb_clean = function (success) {
        if (!success) {
            return;
        }
        doSync(cb_sync);
    };
    
    var cb_sync = function () {
        getDev(path, cb_gDev);
    };
    
    var cb_gDev = function (dev) {
        checkFSClear(dev, 5, 4000, cb_chkFsClr);
    };
    
    var cb_chkFsClr = function (success) {
        callback(success);
        return;
    };
    */
    
    switch(publisherStatus.lastDiscStatus) {
        case 1:
            generateTS();
            break;
        case 2:
            prepOutput();
            break;
        case 3:
            prepOutput();
            break;
        default:
            reloadRecordings();
            // validate input file names
            for (var i = 0; i < sourceFNames.length; i++) {
                if(publisherFiles.indexOf(sourceFNames[i])<0){
                    return;
                }
            }
            initCleanDirs();
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
    
    switch(publisherStatus.lastFileStatus) {
        case 1:
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
            initCleanDirs();
    }
    
}
    

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

var transcodedFiles = [];

// Transcode Videos
function transcodeVideos(currentIndex){
    
    if(exiting){return;}
    
    if(currentIndex>=sourceFNames.length){
        generateXML();
        return;
    }
    
    publisher = spawn('ffmpeg', ['-i', recordDir+sourceFNames[currentIndex], '-target', 'pal-dvd', '-aspect','16:9','publishing/working/vid'+currentIndex+'.mpg'],{cwd: process.cwd(), env: process.env, detached: true});
    //transcodeVideos(currentIndex+1);

    console.log('Transcoding '+sourceFNames[currentIndex]);
    publisherStatus.status = "Transcoding "+sourceFNames[currentIndex];
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
                publisherStatus.status = "Transcoding "+sourceFNames[currentIndex]+": "+output[i].substring(tIndex+5,tIndex+13)+"/"+duration;
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
        transcodedFiles.push('vid'+currentIndex+'.mpg');
        io.emit('publisherUpdate', publisherStatus);
        transcodeVideos(currentIndex+1);
    });
}

// Generate DVDAuthor XML
function generateXML(callback){
    
    if(exiting){return;}
    
    console.log('Configuring Disc');
    publisherStatus.status = "Configuring Disc";
    publisherStatus.complete = 0.4;
    io.emit('publisherUpdate', publisherStatus);
    
    var dvd_xml =  '<dvdauthor dest="../disc_fs">\n'+
                    '    <vmgm>\n'+
                    '        <menus>\n'+
                    '            <video format="PAL" aspect="16:9"></video>\n'
    if(menuFName){
        dvd_xml += '            <pgc entry="title">\n'+
                    '                <button>jump title 1;</button>\n'+
                    '                <vob file="../menus/'+menuFName+'"></vob>\n'+
                    '            </pgc>\n'
    }
    dvd_xml +=     '        </menus>\n'+
                    '    </vmgm>\n'+
                    '    <titleset>\n'+
                    '        <titles>\n'+
                    '            <pgc>\n';

    for (var i = 0; i < transcodedFiles.length; i++) {
        dvd_xml += '                <vob file="'+transcodedFiles[i]+'"></vob>\n';
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
        publisherStatus.lastDiscStatus = 1;
        config.set('publisher:disc_status', publisherStatus.lastDiscStatus);
        config.save();
        generateTS();
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
        publisherStatus.lastDiscStatus = 2;
        config.set('publisher:disc_status', publisherStatus.lastDiscStatus);
        io.emit('publisherUpdate', publisherStatus);
        config.save();
        prepOutput();
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
    publisher = spawn('isoinfo', ['-d', '-i', '/dev/sr0'],{cwd: process.cwd(), env: process.env, detached: true});
    
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
            /*publisherTimer = setTimeout(function(){
                prepOutput();
            }, 4000);*/
        } else {
            writeOutput();
        }
    });
}

// Write Output to Disc
function writeOutput(callback){
    
    if(exiting){return;}
    
    if(discOutput){
        publisher = spawn('growisofs', ['-v','-Z','/dev/sr0','-use-the-force-luke=noload','-V','DVD','-dvd-video','disc_fs/'],{cwd: process.cwd()+'/publishing', env: process.env, detached: true});
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
        publisherStatus.lastDiscStatus = 3;
        config.set('publisher:disc_status', publisherStatus.lastDiscStatus);
        config.save();
        io.emit('publisherUpdate', publisherStatus);
        setTimeout(function(){
            publisherStatus.status = 0;
            publisherStatus.complete = 0;
            io.emit('publisherUpdate', publisherStatus);
        }, 4000);
    });
}








// Send to FTP Server
function uploadFile(callback){
    
    if(exiting){return;}
    
    publisher = spawn('curl',['-T','publishing/file_working/'+destFName+'.mp4', (server.indexOf('ftp://')==0 ? server : 'ftp://'+server), '--user', username+':'+password],{cwd: process.cwd(), env: process.env, detached: true});
    
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
        setTimeout(function(){
            publisherStatus.status = 0;
            publisherStatus.complete = 0;
            io.emit('publisherUpdate', publisherStatus);
        }, 4000);
    });
}







// Change to publish file and add usb functionality
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
    
    reloadRecordings();
    
    // validate input file names
    for (var i = 0; i < sourceFNames.length; i++) {
        if(publisherFiles.indexOf(sourceFNames[i])<0){
            return;
        }
    }
    
    initCleanDirs();
    
    
    // Transcode Videos
    function transcodeVideos(){
        
        if(exiting){return;}
        
        var inputLine = '';
        if(sourceFNames.length<1){
            publisherStatus.status = "Too few files. Cancelling";
            publisherStatus.complete = 1;
            io.emit('publisherUpdate', publisherStatus);
            setTimeout(function(){
                    publisherStatus.status = 0;
                    publisherStatus.complete = 0;
                    io.emit('publisherUpdate', publisherStatus);
            }, 4000);
        } else if(sourceFNames.length==1){
            inputLine = sourceFNames[0];
        } else {
            inputLine = '"concat:'+recordDir+sourceFNames[0];
            for (var i = 1; i < sourceFNames.length; i++) {
                inputLine = inputLine+'|'+recordDir+sourceFNames[i];
            }
            inputLine = inputLine+'"';
        }

        publisher = spawn('ffmpeg', ['-i', inputLine,'-c:v','libx264','-b:v','6000k' , '-c:a', 'aac','-b:a','160k' ,'publishing/file_working/'+(destFName.indexOf('.mp4')>=0 ? destFName : destFName+'.mp4')],{cwd: process.cwd(), env: process.env, detached: true});
        
        console.log('Transcoding');
        publisherStatus.status = "Transcoding";
        publisherStatus.complete = publisherStatus.complete + 0.05;
        io.emit('publisherUpdate', publisherStatus);
        var duration = '00:00:00';
    
        publisher.on('error', function (err) {
            console.log('FTP Export Failed. Error Transcoding File: '+err);
            publisher.kill('SIGTERM');
        });
        
        publisher.stderr.on('data', function (data) {
            var output = String(data).split("\n");
            for (var i = 0; i < output.length; i++) {
		console.log(output[i]);
                var tIndex = output[i].indexOf('time=');
                if(tIndex>=0){
                    publisherStatus.status = "Transcoding: "+output[i].substring(tIndex+5,tIndex+13)+"/"+duration;
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
            uploadFile();
        });
    }
    

    
}
