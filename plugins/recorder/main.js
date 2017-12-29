var recorderStatus = {connected:0,recording:0,remainingSpace:'Remaining&nbsp;Space&nbsp;Unavailable'};
var publisherStatus = {status:0,complete:0,locked:0};
var recorder = 0;

var spawn  = require('child_process').spawn;
var system = null;
var sio_hooks = [];

var config = {
    "port": 4990,
    "out_dir": "/home/user/recordings/",
    "v_bitrate": 12000,
    "a_bitrate": 128
};

exports.load = function (main_sys) {
    
    system = main_sys;
    
    system.setConfigDefaults(config);
    config = system.getConfig();
    
    system.registerSioEvent('connected', function(){
        system.doSioEmit('update', recorderStatus);
    });
    
    for(var i=0; i<sio_hooks.length; i++){
       system.registerSioEvent(sio_hooks[i].event, sio_hooks[i].callback); 
    }
    
    connectToRecorder();
    reloadRecordings();
    getRemainingRecordingSpace();
    
}

exports.unload = function () {
    quitRecorder();
}

exports.notify = function (signalName, value) {
    //Update status if publishing
    if(signalName == "publisher_status"){
        publisherStatus = value;
    }
}

// Socket.IO Callbacks
sio_hooks.push({event:'record', callback:function(enable){
    if(enable){
        startRecording();
    } else {
        stopRecording();
    }
}});

function getRecorderStatus(){
    if(recorder){
        recorder.stdin.write('status\n'); // send 'status'
    }
}

function connectToRecorder(){
    
    if(exiting){return;}
    getRemainingRecordingSpace();
    
    if(recorder){
        system.sendNotice('update', recorderStatus);
        system.doSioEmit('update', recorderStatus);
        console.log('Recorder already initialised');
        return;
    }
    
    //connect to recorder via telnet on 4990
    recorder = spawn('telnet',['localhost',config.port],{cwd: process.cwd(), env: process.env, detached: true});
    
    recorder.stdout.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            if(output[i].indexOf('state playing')>=0){
                recorderStatus.recording = 1;
            } else if(output[i].indexOf('state stopped')>=0){
                getRemainingRecordingSpace();
                recorderStatus.recording = 0;
            }
            system.sendNotice('update', recorderStatus);
            system.doSioEmit('update', recorderStatus);
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
        system.sendNotice('update', recorderStatus);
        system.doSioEmit('update', recorderStatus);
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

/// TODO LINK ///
function startRecording(){
    
    if(exiting){return;}
    
    if(!recorder){
        system.sendNotice('update', recorderStatus);
        system.doSioEmit('update', recorderStatus);
        console.log('Recorder Offline');
        return;
    }
    
    if(recorderStatus.recording){
        system.sendNotice('update', recorderStatus);
        system.doSioEmit('update', recorderStatus);
        console.log('Already recording...');
        return;
    }
    
    if(publisherStatus.status != 0){
        console.log('Publishing; cannot record.');
        system.sendNotice('update', recorderStatus);
        system.doSioEmit('update', recorderStatus);
        return;
    }
    
    recorder.stdin.write('stop\n'); // send 'stop'
    recorder.stdin.write('clear\n'); // send 'clear'
    
    var now = new Date();
    
    recorder.stdin.write('add http://'+my_ip+':5000/ :sout=#transcode:file{dst='+config.out_dir+'recording_'+now.getFullYear()+'-'+
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

function getRemainingRecordingSpace(){
    
    if(exiting){return;}
    
    var spaceRemaining = -1;
    
    //use df to get 
    var df = spawn('df',['-k',config.out_dir],{cwd: process.cwd(), env: process.env, detached: true});
    
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
            console.log('Remaining Space Unavailable');
            return;
        }
        var t = spaceRemaining/((config.v_bitrate+config.a_bitrate)/8)
        var s = t%60;
        var m = t/60;
        var h = m/60;
            m = m%60;
        recorderStatus.remainingSpace = (spaceRemaining/1048576).toFixed(2)+'GB&nbsp;Remaining&nbsp;(Approximately&nbsp;'+h.toFixed(0)+'h'+m.toFixed(0)+'m'+s.toFixed(0)+'s)';
        console.log((spaceRemaining/1048576).toFixed(2)+'GB Remaining (Approximately '+h.toFixed(0)+'h'+m.toFixed(0)+'m'+s.toFixed(0)+'s)');
    });
    
}
