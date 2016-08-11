var config = require('nconf');

config.file('config/config.json');
config.defaults({
    "global": {
        "ip": "192.168.10.232"
    },
    "http": {
        "port": 8080
    },
    "atem": {
        "ip": "192.168.10.240",
        "alvl_frequency": 4
    },
    "live_stream": {
        "port": 5000
    },
    "recorder": {
        "port": 4990,
        "out_dir": "/home/user/recordings/",
        "v_bitrate": 12000,
        "a_bitrate": 128
    },
    "mplayer": {
        "port": 4991
    },
    "publisher": {
        "disc_drive": "/dev/sr0",
        "burn_disc": 1,
        "disc_status": 0,
        "file_status": 0
    },
    "visca": {
        "serial": "/dev/ttyUSB0"
    }
});

// global vars
var exiting = 0;
var my_ip  = config.get('global:ip');

// HTTP & SIO Vars
var httpPort  = config.get('http:port');
var app    = 0;
var http   = 0;
var io     = 0;
var sleep  = require('sleep');
var spawn  = require('child_process').spawn;
var fs     = require("fs");

// ATEM Vars
var atem = 0;
var atemStatus = {atem:0,program:0,preview:0,aux:0,ftb:0,transLength:0.6,audioChannels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]};
var atemALvls = {audioLevels:[[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100]]};
var aLvlInterval = 4;
var aLvlCount = 0;
var inMutex = 0;
var aPreMutex = 0;

// Recorder Vars
var recorderStatus = {connected:0,recording:0,remainingSpace:'Remaining&nbsp;Space&nbsp;Unavailable'};
var recordDir = config.get('recorder:out_dir');
var recordPort = config.get('recorder:port');
var recordVB = config.get('recorder:v_bitrate');
var recordAB = config.get('recorder:a_bitrate');
var recorder = 0;

// Media Player Vars
var mplayerStatus = {connected:0,playing:0};
var mplayerPort = config.get('mplayer:port');
var mplayer = 0;
var mplayerWait = 0;

// Publisher Vars
var publisher = 0;
var publisherTimer = 0;
var publisherStatus = {status:0,complete:0};
var publisherFiles = [];
var discDrive = config.get('publisher:disc_drive');
var discOutput = config.get('publisher:burn_disc');
var lastDiscStatus = config.get('publisher:disc_status');
var lastFileStatus = config.get('publisher:file_status');

// VISCA Vars
var visca = 0;
var viscaSerialDev = config.get('visca:serial');
var viscaLast = 0;
var viscaNext = 0;


/**************************************************/
/**********             ATEM             **********/
/**************************************************/

function sendAtemInput(cmd){
    if(!atem){
        return;
    }
    if(inMutex){
        setTimeout(function(){sendAtemInput(cmd);}, 1);
        return;
    }
    inMutex = 1;
    console.log('ATEM: '+cmd);
    atem.stdin.write(cmd+'\n');
    inMutex = 0;
}

function parseAtemOutput(line){
    var cmd = String(line).toUpperCase().split(" ");
    switch (cmd[0]) {
    case "ALVL:":
        if(aLvlCount){
            break;
        }
        var chnl = parseInt(cmd[2]);
        var lLvl = parseFloat(cmd[4]);
        var rLvl = parseFloat(cmd[5]);
        
        if(isNaN(lLvl)){lLvl=-100;}
        if(isNaN(rLvl)){rLvl=-100;}
        if(chnl<=8){
            atemALvls.audioLevels[chnl][0] = lLvl;
            atemALvls.audioLevels[chnl][1] = rLvl;
        } else {
            switch (chnl) {
            case 1001:
                atemALvls.audioLevels[11][0] = lLvl;
                atemALvls.audioLevels[11][1] = rLvl;
                break;
            case 1201:
                atemALvls.audioLevels[13][0] = lLvl;
                atemALvls.audioLevels[13][1] = rLvl;
                break;
            }
        }
        break;
    case "AMSTRLVL:":
        aLvlCount = ++aLvlCount%aLvlInterval;
        if (aLvlCount == 1%aLvlInterval) {
            io.emit('atemALvls', atemALvls);
        }
        if(aLvlCount){
            break;
        } 
        var lLvl = parseFloat(cmd[1]);
        var rLvl = parseFloat(cmd[2]);
        if(isNaN(lLvl)){lLvl=-100;}
        if(isNaN(rLvl)){rLvl=-100;}
        atemALvls.audioLevels[0][0] = lLvl;
        atemALvls.audioLevels[0][1] = rLvl;
        break;
    case "AINGAIN:":
        var chnl = parseInt(cmd[2]);
        var gain = parseFloat(cmd[4]);
        if(isNaN(gain)){gain=-60;} // -inf input
        if(chnl<=8){
            atemStatus.audioChannels[chnl][1] = gain;
        } else {
            switch (chnl) {
            case 1001:
                atemStatus.audioChannels[11][1] = gain;
                break;
            case 1201:
                atemStatus.audioChannels[13][1] = gain;
                break;
            }
        }
        io.emit('atemUpdate', atemStatus);
        break;
    case "AMSTRGAIN:":
        var gain = parseFloat(cmd[1]);
        if(isNaN(gain)){gain=-60;} // -inf input
        atemStatus.audioChannels[0][1] = gain;
        io.emit('atemUpdate', atemStatus);
        break;
    case "AINSTATE:":
        var chnl = parseInt(cmd[2]);
        var state = parseInt(cmd[4]);
        if(chnl<=8){
            atemStatus.audioChannels[chnl][0] = state;
        } else {
            switch (chnl) {
            case 1001:
                atemStatus.audioChannels[11][0] = state;
                break;
            case 1201:
                atemStatus.audioChannels[13][0] = state;
                break;
            }
        }
        io.emit('atemUpdate', atemStatus);
        break;
    /*case "AINBAL:":
        io.emit('atemUpdate', atemStatus);
        break;*/
    case "PROG:":
        atemStatus.program = parseInt(cmd[1]);
        io.emit('atemUpdate', atemStatus);
        break;
    case "PREV:":
        atemStatus.preview = parseInt(cmd[1]);
        io.emit('atemUpdate', atemStatus);
        break;
    case "AUX:":
        if(parseInt(cmd[2])==0){
            atemStatus.aux = parseInt(cmd[4]);
            io.emit('atemUpdate', atemStatus);
        }
        break;
    /*case "TSTYLE:":
        
        break;*/
    case "TMIXFRAMES:":
        atemStatus.transLength = parseInt(cmd[1])/50.0;
        io.emit('atemUpdate', atemStatus);
        break;
    default:
        break;
    }
}

function runAudioPreset(input){
        
        if(aPreMutex){
            return;
        }
        
        aPreMutex = 1;
        
        var orig = atemStatus.audioChannels.slice();
        for (var i = 0; i < orig.length; i++) {
            orig[i] = orig[i].slice();
        }
        
        var current = atemStatus.audioChannels;
        var target = input.audioChannels;
        var increment = [0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0];
        
        if(current[1][0]  == 0 && target[1][0]  == 1){current[1][1]  = -60; sendAtemInput('SET AINSTATE 1 1');    sendAtemInput('SET AINGAIN 1 -60');}
        if(current[2][0]  == 0 && target[2][0]  == 1){current[2][1]  = -60; sendAtemInput('SET AINSTATE 2 1');    sendAtemInput('SET AINGAIN 2 -60');}
        if(current[3][0]  == 0 && target[3][0]  == 1){current[3][1]  = -60; sendAtemInput('SET AINSTATE 3 1');    sendAtemInput('SET AINGAIN 3 -60');}
        if(current[4][0]  == 0 && target[4][0]  == 1){current[4][1]  = -60; sendAtemInput('SET AINSTATE 4 1');    sendAtemInput('SET AINGAIN 4 -60');}
        if(current[5][0]  == 0 && target[5][0]  == 1){current[5][1]  = -60; sendAtemInput('SET AINSTATE 5 1');    sendAtemInput('SET AINGAIN 5 -60');}
        if(current[6][0]  == 0 && target[6][0]  == 1){current[6][1]  = -60; sendAtemInput('SET AINSTATE 6 1');    sendAtemInput('SET AINGAIN 6 -60');}
        if(current[7][0]  == 0 && target[7][0]  == 1){current[7][1]  = -60; sendAtemInput('SET AINSTATE 7 1');    sendAtemInput('SET AINGAIN 7 -60');}
        if(current[8][0]  == 0 && target[8][0]  == 1){current[8][1]  = -60; sendAtemInput('SET AINSTATE 8 1');    sendAtemInput('SET AINGAIN 8 -60');}
        if(current[11][0] == 0 && target[11][0] == 1){current[11][1] = -60; sendAtemInput('SET AINSTATE 1001 1'); sendAtemInput('SET AINGAIN 1001 -60');}
        if(current[13][0] == 0 && target[13][0] == 1){current[13][1] = -60; sendAtemInput('SET AINSTATE 1201 1'); sendAtemInput('SET AINGAIN 1201 -60');}
        
        if(current[1][0] == 1  && target[1][0]  == 0){target[1][1] =  -60;}
        if(current[2][0] == 1  && target[2][0]  == 0){target[2][1] =  -60;}
        if(current[3][0] == 1  && target[3][0]  == 0){target[3][1] =  -60;}
        if(current[4][0] == 1  && target[4][0]  == 0){target[4][1] =  -60;}
        if(current[5][0] == 1  && target[5][0]  == 0){target[5][1] =  -60;}
        if(current[6][0] == 1  && target[6][0]  == 0){target[6][1] =  -60;}
        if(current[7][0] == 1  && target[7][0]  == 0){target[7][1] =  -60;}
        if(current[8][0] == 1  && target[8][0]  == 0){target[8][1] =  -60;}
        if(current[11][0] == 1 && target[11][0] == 0){target[11][1] = -60;}
        if(current[13][0] == 1 && target[13][0] == 0){target[13][1] = -60;}
        
        if(current[1][0] == 0  && target[1][0]  == 0){target[1][1] =  current[1][1];}
        if(current[2][0] == 0  && target[2][0]  == 0){target[2][1] =  current[2][1];}
        if(current[3][0] == 0  && target[3][0]  == 0){target[3][1] =  current[3][1];}
        if(current[4][0] == 0  && target[4][0]  == 0){target[4][1] =  current[4][1];}
        if(current[5][0] == 0  && target[5][0]  == 0){target[5][1] =  current[5][1];}
        if(current[6][0] == 0  && target[6][0]  == 0){target[6][1] =  current[6][1];}
        if(current[7][0] == 0  && target[7][0]  == 0){target[7][1] =  current[7][1];}
        if(current[8][0] == 0  && target[8][0]  == 0){target[8][1] =  current[8][1];}
        if(current[11][0] == 0 && target[11][0] == 0){target[11][1] =  current[11][1];}
        if(current[13][0] == 0 && target[13][0] == 0){target[13][1] =  current[13][1];}
        
        increment[1]  = (target[1][1]  - current[1][1])/20.0;
        increment[2]  = (target[2][1]  - current[2][1])/20.0;
        increment[3]  = (target[3][1]  - current[3][1])/20.0;
        increment[4]  = (target[4][1]  - current[4][1])/20.0;
        increment[5]  = (target[5][1]  - current[5][1])/20.0;
        increment[6]  = (target[6][1]  - current[6][1])/20.0;
        increment[7]  = (target[7][1]  - current[7][1])/20.0;
        increment[8]  = (target[8][1]  - current[8][1])/20.0;
        increment[11] = (target[11][1] - current[11][1])/20.0;
        increment[13] = (target[13][1] - current[13][1])/20.0;
        
        function doIncrement(i){
            if(i==0){
                return;
            }
            current[1][1] = current[1][1] + increment[1];
            current[2][1] = current[2][1] + increment[2];
            current[3][1] = current[3][1] + increment[3];
            current[4][1] = current[4][1] + increment[4];
            current[5][1] = current[5][1] + increment[5];
            current[6][1] = current[6][1] + increment[6];
            current[7][1] = current[7][1] + increment[7];
            current[8][1] = current[8][1] + increment[8];
            current[11][1] = current[11][1] + increment[11];
            current[13][1] = current[13][1] + increment[13];
            
            sendAtemInput('SET AINGAIN 1 '+current[1][1]);
            sendAtemInput('SET AINGAIN 2 '+current[2][1]);
            sendAtemInput('SET AINGAIN 3 '+current[3][1]);
            sendAtemInput('SET AINGAIN 4 '+current[4][1]);
            sendAtemInput('SET AINGAIN 5 '+current[5][1]);
            sendAtemInput('SET AINGAIN 6 '+current[6][1]);
            sendAtemInput('SET AINGAIN 7 '+current[7][1]);
            sendAtemInput('SET AINGAIN 8 '+current[8][1]);
            sendAtemInput('SET AINGAIN 1001 '+current[11][1]);
            sendAtemInput('SET AINGAIN 1201 '+current[13][1]);
            
            setTimeout(function(){doIncrement(i-1);}, 50);
        }
        console.log(orig[11][1]);
        doIncrement(20);
        
        // After increments complete, mute & reset inputs
        setTimeout(function(){        
        console.log(orig[11][1]);
        if(current[1][0]  == 1 && target[1][0]  == 0){sendAtemInput('SET AINSTATE 1 0'); sendAtemInput('SET AINGAIN 1 '+orig[1][1]);}
        if(current[2][0]  == 1 && target[2][0]  == 0){sendAtemInput('SET AINSTATE 2 0'); sendAtemInput('SET AINGAIN 2 '+orig[2][1]);}
        if(current[3][0]  == 1 && target[3][0]  == 0){sendAtemInput('SET AINSTATE 3 0'); sendAtemInput('SET AINGAIN 3 '+orig[3][1]);}
        if(current[4][0]  == 1 && target[4][0]  == 0){sendAtemInput('SET AINSTATE 4 0'); sendAtemInput('SET AINGAIN 4 '+orig[4][1]);}
        if(current[5][0]  == 1 && target[5][0]  == 0){sendAtemInput('SET AINSTATE 5 0'); sendAtemInput('SET AINGAIN 5 '+orig[5][1]);}
        if(current[6][0]  == 1 && target[6][0]  == 0){sendAtemInput('SET AINSTATE 6 0'); sendAtemInput('SET AINGAIN 6 '+orig[6][1]);}
        if(current[7][0]  == 1 && target[7][0]  == 0){sendAtemInput('SET AINSTATE 7 0'); sendAtemInput('SET AINGAIN 7 '+orig[7][1]);}
        if(current[8][0]  == 1 && target[8][0]  == 0){sendAtemInput('SET AINSTATE 8 0'); sendAtemInput('SET AINGAIN 8 '+orig[8][1]);}
        if(current[11][0] == 1 && target[11][0] == 0){sendAtemInput('SET AINSTATE 1001 0'); sendAtemInput('SET AINGAIN 1001 '+orig[11][1]);}
        if(current[13][0] == 1 && target[13][0] == 0){sendAtemInput('SET AINSTATE 1201 0'); sendAtemInput('SET AINGAIN 1201 '+orig[13][1]);}
        
        aPreMutex = 0;
        }, 1100);
        
}

function connectToAtem(){
    
    if(exiting){return;}
    
    if(atem){return;}
    
    
    atem = spawn('./atem/atem-cli', ['192.168.10.240'],{cwd: process.cwd(), env: process.env, detached: true});
    
    atemStatus.atem = 1;
    io.emit('atemUpdate', atemStatus);

    atem.stdout.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            //console.log('ATEM: ' + output[i]);
            parseAtemOutput(output[i]);
        }
    });

    atem.stderr.on('data', function (data) {
        console.log('ATEM STDERR: ' + data);
    });

    atem.on('error', function (err) {
    console.log('Failed to start atem-cli.');
    });

    atem.on('exit', function (code) {
        console.log('atem-cli exited with code ' + code + '\nReconnecting ...');
        atem.kill('SIGKILL');
        atem = 0;
        atemStatus.atem = 0;
        io.emit('atemUpdate', atemStatus);
        
        if(exiting){
            return;
        }
        
        setTimeout(function(){
            connectToAtem();
        }, 3000);
    });


    setTimeout(function(){
        sendAtemInput('GET PROG');
        sendAtemInput('GET PREV');
        sendAtemInput('GET AUXSRC 0');
        sendAtemInput('GET ACHNLS');
        sendAtemInput('ENABLE ALVLS 1 2 3 4 5 6 7 8 1001 1201');
    }, 2000);
    
}

function stopAtemConnection(){
    if(atem){
        exiting = 1;
        atem.kill('SIGTERM');
        exiting = 0;
    }
}


/**************************************************/
/**********          Recording           **********/
/**************************************************/

function getRecorderStatus(){
    if(recorder){
        recorder.stdin.write('status\n'); // send 'status'
    }
}

function connectToRecorder(){
    
    if(exiting){return;}
    getRemainingRecordingSpace();
    
    if(recorder){
        io.emit('recorderUpdate', recorderStatus);
        console.log('Recorder already initialised');
        return;
    }
    
    //connect to recorder via telnet on 4990
    recorder = spawn('telnet',['localhost','4990'],{cwd: process.cwd(), env: process.env, detached: true});
    
    recorder.stdout.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            if(output[i].indexOf('state playing')>=0){
                recorderStatus.recording = 1;
                io.emit('recorderUpdate', recorderStatus);
            } else if(output[i].indexOf('state stopped')>=0){
                getRemainingRecordingSpace();
                recorderStatus.recording = 0;
                io.emit('recorderUpdate', recorderStatus);
            }
        }
    });
    
    recorder.on('error', function (err) {
        console.log('Failed to connect to recorder.');
    });

    recorder.on('exit', function (code) {
        console.log('Connection to recorder exited with code ' + code + '\nReconnecting...');
        recorder.kill('SIGKILL');
        recorder = 0;
        recorderStatus.recording = 0;
        getRemainingRecordingSpace();
        io.emit('recorderUpdate', recorderStatus);
        if(exiting){
            return;
        }
        
        setTimeout(function(){
            connectToRecorder();
        }, 3000);
    });
    
    setTimeout(function(){
        getRecorderStatus();
    }, 100);
    
}

function startRecording(){
    
    if(exiting){return;}
    
    if(!recorder){
        io.emit('recorderUpdate', recorderStatus);
        console.log('Recorder Offline');
        return;
    }
    
    if(recorderStatus.recording){
        io.emit('recorderUpdate', recorderStatus);
        console.log('Already recording...');
        return;
    }
    
    if(publisher){
        io.emit('publisherUpdate', publisherStatus);
        console.log('Publishing; cannot record.');
        return;
    }
    
    recorder.stdin.write('stop\n'); // send 'stop'
    recorder.stdin.write('clear\n'); // send 'clear'
    
    var now = new Date();
    
    recorder.stdin.write('add http://'+my_ip+':5000/ :sout=#transcode:file{dst='+recordDir+'recording_'+now.getFullYear()+'-'+
                        ((now.getMonth()+1)<10 ? '0'+(now.getMonth()+1) : (now.getMonth()+1))+'-'+
                        (now.getDate()<10 ? '0'+now.getDate() : now.getDate())+'_'+
                        (now.getHours()<10 ? '0'+now.getHours() : now.getHours())+'h'+
                        (now.getMinutes()<10 ? '0'+now.getMinutes() : now.getMinutes())+'m'+
                        (now.getSeconds()<10 ? '0'+now.getSeconds() : now.getSeconds())+'s.mpeg}\n');
    
    setTimeout(function(){
        getRecorderStatus();
    }, 100);
    
}

function stopRecording(){
    if(recorder){
        recorder.stdin.write('stop\n'); // send 'stop'
        recorder.stdin.write('clear\n'); // send 'clear'
    }
    
    setTimeout(function(){
        getRecorderStatus();
    }, 100);
}

function quitRecorder(){
    if(recorder){
        stopRecording();
        exiting = 1;
        recorder.kill('SIGTERM');
        exiting = 0;
    }
}

function reloadRecordings(){
    
    fs.readdir(recordDir, function (err, files) {
        if (err) {
            console.log('error getting recordings at '+recordDir+' ' + err);
            return;
        }
        publisherFiles = files.slice();
        io.emit('recordingList', publisherFiles);
    });
}

function getRemainingRecordingSpace(){
    
    if(exiting){return;}
    
    var spaceRemaining = -1;
    
    //use df to get 
    var df = spawn('df',['-k',recordDir],{cwd: process.cwd(), env: process.env, detached: true});
    
    df.stdout.on('data', function (data) {
        var output = String(data).split("\n");
        var results = [];
        for (var i = 0; i < output.length; i++) {
            if(output[i].startsWith('/dev/')){
                results = output[i].split(" ");
                break;
            }
        }
        for (var i = 1; i < results.length; i++) {
            var kBytes = parseInt(results[i]);
            if(!isNaN(kBytes)){
                spaceRemaining = kBytes;
                break;
            }
        }
        if (spaceRemaining < 0){
            recorderStatus.remainingSpace = 'Remaining&nbsp;Space&nbsp;Unavailable';
            console.log(recorderStatus.remainingSpace);
            return;
        }
        var t = spaceRemaining/((recordVB+recordAB)/8)
        var s = t%60;
        var m = t/60;
        var h = m/60;
            m = m%60;
        recorderStatus.remainingSpace = (spaceRemaining/1048576).toFixed(2)+'GB&nbsp;Remaining&nbsp;(Approximately&nbsp;'+h.toFixed(0)+'h'+m.toFixed(0)+'m'+s.toFixed(0)+'s)';
        console.log(recorderStatus.remainingSpace);
    });
    
}


/**************************************************/
/**********         Media Player         **********/
/**************************************************/

function getMediaPlayerStatus(){
    if(mplayer){
        mplayer.stdin.write('status\n'); // send 'status'
    }
}

function connectToMediaPlayer(){
    
    if(exiting){return;}
    
    if(mplayer){
        io.emit('mplayerUpdate', mplayerStatus);
        console.log('Media Player already initialised');
        return;
    }
    
    //connect to mplayer via telnet on 4991
    mplayer = spawn('telnet',['localhost','4991'],{cwd: process.cwd(), env: process.env, detached: true});
    
    mplayer.stdout.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            if(output[i].indexOf('state playing')>=0){
                mplayerStatus.playing = 1;
            } else if(output[i].indexOf('state stopped')>=0){
                mplayerStatus.playing = 0;
            } else if(output[i].indexOf('state paused')>=0){
                mplayerStatus.playing = 2;
                
            }
        }
        io.emit('mplayerUpdate', mplayerStatus);
    });
    
    mplayer.on('error', function (err) {
        console.log('Failed to connect to mplayer.');
    });

    mplayer.on('exit', function (code) {
        console.log('Connection to mplayer exited with code ' + code + '\nReconnecting...');
        mplayer.kill('SIGKILL');
        mplayer = 0;
        mplayerStatus.connected = 0;
        io.emit('mplayerUpdate', mplayerStatus);
        if(exiting){
            return;
        }
        
        setTimeout(function(){
            connectToMediaPlayer();
        }, 3000);
    });
    
    setTimeout(function(){
        getMediaPlayerStatus();
    }, 100);
    
}

function playMediaPlayer(mrl){
    
    if(exiting){return;}
    
    if(!mplayer){
        io.emit('mplayerUpdate', mplayerStatus);
        console.log('mplayer Offline');
        return;
    }
    
    if(publisher){
        io.emit('publisherUpdate', publisherStatus);
        console.log('Cannot Play; Publishing');
        return;
    }
    
    mplayer.stdin.write('stop\n'); // send 'stop'
    mplayer.stdin.write('clear\n'); // send 'clear'
    
    var now = new Date();
    
    mplayer.stdin.write('add '+mrl+'\n');
    console.log('add '+mrl+'\n');
    
    setTimeout(function(){
        getMediaPlayerStatus();
    }, 100);
    
}

function pauseMediaPlayer(){
    if(mplayer){
        mplayer.stdin.write('pause\n'); // send 'pause'
    }
    
    setTimeout(function(){
        getMediaPlayerStatus();
    }, 100);
}

function stopMediaPlayer(){
    if(mplayer){
        mplayer.stdin.write('stop\n'); // send 'stop'
        mplayer.stdin.write('clear\n'); // send 'clear'
    }
    
    setTimeout(function(){
        getMediaPlayerStatus();
    }, 100);
}

function quitMediaPlayer(){
    if(mplayer){
        stopMediaPlayer();
        exiting = 1;
        mplayer.kill('SIGTERM');
        exiting = 0;
    }
}


/**************************************************/
/**********   Publishing & Disc Burning  **********/
/**************************************************/

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
    
    reloadRecordings();
    
    // validate input file names
    for (var i = 0; i < sourceFNames.length; i++) {
        if(publisherFiles.indexOf(sourceFNames[i])<0){
            return;
        }
    }
    
    initCleanDirs();
    
    
    // Clean Working Directories
    function initCleanDirs(){
        
        if(exiting){return;}
        
        publisher = spawn('rm', ['-rf','publishing/disc_working','publishing/disc_fs'],{cwd: process.cwd(), env: process.env, detached: true});
        
        publisherStatus.status = "Initialising";
        publisherStatus.complete = 0.01;
        io.emit('publisherUpdate', publisherStatus);
    
        publisher.on('error', function (err) {
            console.log('Disc Creation Failed.');
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
            setupDirs();
        });
        
    }
    
    // Create Working Directories
    function setupDirs(){
        
        if(exiting){return;}
        
        publisher = spawn('mkdir', ['-p','publishing/disc_working','publishing/disc_fs'],{cwd: process.cwd(), env: process.env, detached: true});
        
        console.log('Initialising');
        publisherStatus.status = "Initialising";
        publisherStatus.complete = 0.03;
        io.emit('publisherUpdate', publisherStatus);
    
        publisher.on('error', function (err) {
            console.log('Disc Creation Failed. Error Setting Up Directories: '+err);
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
            transcodeVideos(0);
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
            console.log('Disc Creation Failed. Error Transcoding File: '+err);
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
    function generateXML(){
        
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
            generateTS();
        });
        
    }
    
    // DVDAuthor TS
    function generateTS(){
        
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
            console.log('Disc Creation Failed. Error Generating TS: '+err);
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
            prepOutput();
        });
    }
    
    // Ensure Disc Ready
    function prepOutput(){
        
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
                console.log('No blank disc found, please insert one & start again.');
                publisherStatus.status = "No blank disc found, please insert one & start again";
                publisherStatus.complete = 0.49;
                io.emit('publisherUpdate', publisherStatus);
                publisherTimer = setTimeout(function(){
                    prepOutput();
                }, 4000);
            } else {
                writeOutput();
            }
        });
    }
    
    // Write Output to Disc
    function writeOutput(){
        
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
            io.emit('publisherUpdate', publisherStatus);
            setTimeout(function(){
                publisherStatus.status = 0;
                publisherStatus.complete = 0;
                io.emit('publisherUpdate', publisherStatus);
            }, 4000);
        });
    }
    
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
    
    
    // Clean Working Directories
    function initCleanDirs(){
        
        if(exiting){return;}
        
        publisher = spawn('rm', ['-rf','publishing/file_working'],{cwd: process.cwd(), env: process.env, detached: true});
        
        publisherStatus.status = "Initialising";
        publisherStatus.complete = 0.01;
        io.emit('publisherUpdate', publisherStatus);
    
        publisher.on('error', function (err) {
            console.log('FTP Export Failed.');
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
            setupDirs();
        });
        
    }
    
    // Create Working Directories
    function setupDirs(){
        
        if(exiting){return;}
        
        publisher = spawn('mkdir', ['-p','publishing/file_working'],{cwd: process.cwd(), env: process.env, detached: true});
        
        console.log('Initialising');
        publisherStatus.status = "Initialising";
        publisherStatus.complete = 0.03;
        io.emit('publisherUpdate', publisherStatus);
    
        publisher.on('error', function (err) {
            console.log('FTP Export Failed. Error Setting Up Directories: '+err);
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
            transcodeVideos();
        });
    }
    
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
    
    // Send to FTP Server
    function uploadFile(){
        
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
    
}

function stopPublisher(){
    if(publisherTimer){
        clearTimeout(publisherTimer);
    }
    if(publisher){
        exiting = 1;
        publisher.kill('SIGTERM');
        exiting = 0;
    }
    console.log('Cancelled');
    publisherStatus.status = "Cancelled";
    publisherStatus.complete = 1;
    io.emit('publisherUpdate', publisherStatus);
    setTimeout(function(){
            publisherStatus.status = 0;
            publisherStatus.complete = 0;
            io.emit('publisherUpdate', publisherStatus);
    }, 4000);
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
                callback();
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
function clearFS(dev, callback){
    
    var stat = spawn('cat',['/sys/block/'+dev+'/stat'],{cwd: process.cwd(), env: process.env, detached: true});
    
    fs.readFile('/sys/block/'+dev+'/stat', 'utf8', function(err, contents) {
        var output = String(contents).split(" ");
        if (output.length < 8) {
            return;
        } else {
            if(output[8] == '0'){
                callback();
            } else {
                setTimeout(function(){
                    clearFS(dev, callback);
                }, 4000);
            }
        }
    });
    
}

function syncAndClear(path, callback){
    
    //doSync(getFS(path,clearFS(callback)));
    
    //lsof
    //sync
    //stat
    
    
    
}

/**************************************************/
/**********             VISCA            **********/
/**************************************************/

function sendPtzCmd(ptzInfo){
    
    if(ptzInfo){
        viscaNext = ptzInfo;
    }
    
    if(JSON.stringify(viscaLast) === JSON.stringify(viscaNext)){ //repeat command
        return;
    }

    if(visca){
        setTimeout(function(){sendPtzCmd(null);}, 128);
        return;
    }
    
    viscaLast = viscaNext;

    if(viscaNext.zoom){
        sendViscaZoom(viscaNext.camera,viscaNext.zoom)
    } else if(viscaNext.pan || viscaNext.tilt){
        sendViscaPanTilt(viscaNext.camera,viscaNext.pan,viscaNext.tilt);
    } else {
        sendViscaPanTilt(viscaNext.camera,0,0);
        sendViscaZoom(viscaNext.camera,0);
    }
    
}

function sendViscaPanTilt(camera,panSpeed,tiltSpeed){
    
    if(exiting){return;}
    
    var cmdName = '';
    
    if(panSpeed > 24){panSpeed=24;}
    if(panSpeed < -24){panSpeed=-24;}
    if(tiltSpeed > 20){tiltSpeed=20;}
    if(tiltSpeed < -20){tiltSpeed=-20;}
    
    if(panSpeed == 0 && tiltSpeed == 0){cmdName = 'set_pantilt_stop'; panSpeed=1; tiltSpeed=1;}
    else if(panSpeed >= 0 && tiltSpeed >= 0){cmdName = 'set_pantilt_upright';}
    else if(panSpeed < 0 && tiltSpeed >= 0){cmdName = 'set_pantilt_upleft'; panSpeed*=-1;}
    else if(panSpeed >= 0 && tiltSpeed < 0){cmdName = 'set_pantilt_downright'; tiltSpeed*=-1;}
    else if(panSpeed < 0 && tiltSpeed < 0){cmdName = 'set_pantilt_downleft'; panSpeed*=-1; tiltSpeed*=-1;}
    //else if(panSpeed > 0 && tiltSpeed > 0){cmdName = 'set_pantilt_upright';}
    //else if(panSpeed < 0 && tiltSpeed > 0){cmdName = 'set_pantilt_upleft'; panSpeed*=-1;}
    //else if(panSpeed > 0 && tiltSpeed < 0){cmdName = 'set_pantilt_downright'; tiltSpeed*=-1;}
    //else if(panSpeed < 0 && tiltSpeed < 0){cmdName = 'set_pantilt_downleft'; panSpeed*=-1; tiltSpeed*=-1;}
    //else if(panSpeed == 0 && tiltSpeed > 0){cmdName = 'set_pantilt_up'; panSpeed=1;}
    //else if(panSpeed == 0 && tiltSpeed < 0){cmdName = 'set_pantilt_down'; tiltSpeed*=-1;}
    //else if(panSpeed > 0 && tiltSpeed == 0){cmdName = 'set_pantilt_right'; tiltSpeed=1;}
    //else if(panSpeed < 0 && tiltSpeed == 0){cmdName = 'set_pantilt_left'; panSpeed*=-1;}
    
    
    visca = spawn('./visca/visca-cli-multi', ['-d','/dev/ttyUSB0','camera',camera,cmdName,panSpeed,tiltSpeed],{cwd: process.cwd(), env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        timeout = 0;
        visca = 0;
    });
}

function sendViscaZoom(camera,zoomSpeed){
    
    if(exiting){return;}
    
    var cmdName = '';
    
    if(zoomSpeed > 7){zoomSpeed=7;}
    if(zoomSpeed < -7){zoomSpeed=-7;}
    
    if(zoomSpeed >= 2){cmdName = 'set_zoom_tele_speed';}
    else if(zoomSpeed <= -2){cmdName = 'set_zoom_wide_speed'; zoomSpeed*=-1;}
    else {cmdName = 'set_zoom_stop';}
    
    visca = spawn('./visca/visca-cli-multi', ['-d','/dev/ttyUSB0','camera',camera,cmdName,zoomSpeed],{cwd: process.cwd(), env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
    });
}

function setRecallViscaMemory(camera,set,slot){
    
   if(exiting || visca){return;}
   if(slot > 5 || slot < 0){return;}
   
    if(set){
            sendViscaSetMemory(camera,slot);
    } else {
            sendViscaRecallMemory(camera,slot);
    }
}

function sendViscaRecallMemory(camera,slot){
    
    if(exiting || visca){return;}
    if(slot > 5 || slot < 0){return;}
    
    visca = spawn('./visca/visca-cli-multi', ['-d','/dev/ttyUSB0','camera',camera,'memory_recall',''+slot+''],{cwd: process.cwd(), env: process.env, detached: false});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
    });
}

function sendViscaSetMemory(camera,slot){
    
    if(exiting || visca){return;}
    if(slot > 5 || slot < 0){return;}

    visca = spawn('./visca/visca-cli-multi', ['-d','/dev/ttyUSB0','camera',camera,'memory_set',slot],{cwd: process.cwd(), env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
    });
}

function sendViscaPanTiltPos(camera,panSpeed,tiltSpeed,panPos,tiltPos){
    
    if(exiting || visca){return;}
    
    if(panSpeed > 24){panSpeed=24;}
    if(panSpeed < 1){panSpeed=1;}
    if(tiltSpeed > 20){tiltSpeed=20;}
    if(tiltSpeed < 1){tiltSpeed=1;}
    if(panPos > 880){panPos=880;}
    if(panPos < -879){panPos=-879;}
    if(tiltPos > 300){tiltPos=300;}
    if(tiltPos < -299){tiltPos=-299;}
    
    visca = spawn('./visca/visca-cli-multi', ['-d','/dev/ttyUSB0','camera',camera,'set_pantilt_absolute_position',panSpeed,tiltSpeed,panPos,tiltPos],{cwd: process.cwd(), env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
    });
}

function sendViscaZoomLvl(camera,zoomValue){
    
    if(exiting || visca){return;}
    
    if(zoomValue > 1023){zoomValue=1023;}
    if(zoomValue < 0){zoomValue=0;}
    
    visca = spawn('./visca/visca-cli-multi', ['-d','/dev/ttyUSB0','camera',camera,'set_zoom_value',zoomValue],{cwd: process.cwd(), env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
    });
}

function quitVisca(){
    if(visca){
        exiting = 1;
        visca.kill('SIGTERM');
        exiting = 0;
    }
}


/**************************************************/
/**********    HTTP Server & Socket.IO   **********/
/**************************************************/

function initApp(){
    
    app = require('express')();
    
    // HTTP GET Requests
    app.get('/', function(req, res){
        res.sendFile(__dirname+'/static/index.html');
        res.set("Connection", "close");
    });

    app.get('/publish', function(req, res){
        res.sendFile(__dirname+'/static/publish.html');
        res.set("Connection", "close");
    });

    app.get('/settings', function(req, res){
        res.sendFile(__dirname+'/static/settings.html');
        res.set("Connection", "close");
    });

    app.get('/index.io.js', function(req, res){
        res.sendFile(__dirname+'/static/index.io.js');
        res.set("Connection", "close");
    });

    app.get('/publish.io.js', function(req, res){
        res.sendFile(__dirname+'/static/publish.io.js');
        res.set("Connection", "close");
    });

    app.get('/settings.io.js', function(req, res){
        res.sendFile(__dirname+'/static/settings.io.js');
        res.set("Connection", "close");
    });

    app.get('/bootstrap/hammer.min.js', function(req, res){
        res.sendFile(__dirname+'/bootstrap/hammer.min.js');
        res.set("Connection", "close");
    });

    app.get('/bootstrap/jquery.min.js', function(req, res){
        res.sendFile(__dirname+'/bootstrap/jquery.min.js');
        res.set("Connection", "close");
    });

    app.get('/bootstrap/bootstrap.min.js', function(req, res){
        res.sendFile(__dirname+'/bootstrap/bootstrap.min.js');
        res.set("Connection", "close");
    });

    app.get('/bootstrap/bootstrap.min.css', function(req, res){
        res.sendFile(__dirname+'/bootstrap/bootstrap.min.css');
        res.set("Connection", "close");
    });

    app.get('/bootstrap/bootstrap.mod.css', function(req, res){
        res.sendFile(__dirname+'/bootstrap/bootstrap.mod.css');
        res.set("Connection", "close");
    });
    
    app.get('/fonts/glyphicons-halflings-regular.svg', function(req, res){
        res.sendFile(__dirname+'/bootstrap/fonts/glyphicons-halflings-regular.svg');
        res.set("Connection", "close");
    });
    
    app.get('/fonts/glyphicons-halflings-regular.woff2', function(req, res){
        res.sendFile(__dirname+'/bootstrap/fonts/glyphicons-halflings-regular.woff2');
        res.set("Connection", "close");
    });
    
    app.get('/fonts/glyphicons-halflings-regular.woff', function(req, res){
        res.sendFile(__dirname+'/bootstrap/fonts/glyphicons-halflings-regular.woff');
        res.set("Connection", "close");
    });
    
    app.get('/fonts/glyphicons-halflings-regular.ttf', function(req, res){
        res.sendFile(__dirname+'/bootstrap/fonts/glyphicons-halflings-regular.ttf');
        res.set("Connection", "close");
    });
    
}

// http
function initHttp(){
    
    if(!app){return;}
    
    http = require('http').Server(app);
    
    http.listen(httpPort, function(){
        console.log('listening on '+my_ip+':'+httpPort);
    }); 
    
}

function closeHttp(){
    http.close();
}

// socket.io
function initSIO(){
    
    if(!http){return;}
    
    io = require('socket.io')(http);

    io.on('connection', function(socket){
        console.log('Connection received');
        io.emit('atemUpdate', atemStatus);
        io.emit('recorderUpdate', recorderStatus);
        io.emit('publisherUpdate', publisherStatus);
        
        socket.on('disconnect', function(){
            console.log('User disconnected');
        });
        
        socket.on('changeProgram', function(change){
            if(change.trans == 'cut'){
                sendAtemInput('SET PREV '+change.input);
                sendAtemInput('DO CUT');
            } else if(change.trans == 'mix'){
                sendAtemInput('SET PREV '+change.input);
                sendAtemInput('DO TRANS');
            } else {
                sendAtemInput('SET PROG '+change.input);
            }
        });
        
        socket.on('setPreview', function(input){
            sendAtemInput('SET PREV '+input);
        });
        
        socket.on('setAux', function(input){
            sendAtemInput('SET AUXSRC 0 '+input);
        });
        
        socket.on('setTransLength', function(time){
            sendAtemInput('SET TMIXFRAMES '+ Math.round( time*50 ));
        });
        
        socket.on('setAudioMute', function(input){
            sendAtemInput('SET AINSTATE '+input.channel+' '+input.mute);
        });
        
        socket.on('setAudioVolume', function(input){
            if(input.channel>0){
                sendAtemInput('SET AINGAIN '+input.channel+' '+input.volume);
            } else {
                sendAtemInput('SET AMSTRGAIN '+input.volume);
            }
            
        });
        
        socket.on('runAudioPreset', function(input){
            runAudioPreset(input);        
        });
        
        socket.on('sendPtzCmd', function(ptzInfo){
            sendPtzCmd(ptzInfo);
        });
        
        socket.on('sendPtzRecall', function(presetInfo){
            quitVisca();
            setRecallViscaMemory(presetInfo.camera,0,presetInfo.slot);
        });
        
        socket.on('record', function(enable){
            if(enable){
                startRecording();
            } else {
                stopRecording();
            }
        });
        
        socket.on('getRecordingList', function(){
            reloadRecordings();
            io.emit('recordingList', publisherFiles);
        });
        
        socket.on('playMedia', function(media){
            playMediaPlayer(media);
        });
        
        socket.on('pauseMedia', function(){
            pauseMediaPlayer();
        });
        
        socket.on('stopMedia', function(){
            stopMediaPlayer();
        });
        
        socket.on('burnDisc', function(discInfo){
            publishDisc(discInfo.sourceFNames, 'menu01.mpg', false);
        });
        
        socket.on('uploadFile', function(uploadInfo){
            publishFTP(uploadInfo.sourceFNames, uploadInfo.destFName, uploadInfo.server, uploadInfo.username, uploadInfo.password, false);
        });

        socket.on('cancelPublish', function(){
            stopPublisher();
        });
        
    });

}

function cleanup(){
    quitVisca();
    quitMediaPlayer();
    quitRecorder();
    stopPublisher();
    stopAtemConnection();
    exiting = 1;
    process.exit(0);
}

process.on('exit', function () {console.log('Exiting. Cleaning Up...'); cleanup();});
process.on('SIGINT', function () {console.log('SIGINT received.'); process.exit();});
process.on('SIGTERM', function () {console.log('SIGTERM received.'); process.exit();});
process.on('uncaughtException', function(e) {console.log('Uncaught Exception!\n'+e); process.exit();});//initHttp();});

initApp();
initHttp();
initSIO();

reloadRecordings();
getRemainingRecordingSpace();
//connectToAtem();
//connectToRecorder();
//connectToMediaPlayer();
