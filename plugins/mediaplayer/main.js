var mediaplayerStatus = {connected:0,playing:0};
var mediaplayer = 0;
var mediaplayerWait = 0;
var exiting = 0;

var spawn  = require('child_process').spawn;
var system = null;
var sio_hooks = [];

var config = {
    "port": 4991
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
    
    connectToMediaPlayer();
    
}

exports.unload = function () {
    quitMediaPlayer();
}

exports.notify = function (signalName, value) {
    //Do not need any updates
}

// Socket.IO Callbacks
sio_hooks.push({event:'play', callback:function(media){
    playMediaPlayer(media);
}});

sio_hooks.push({event:'pause', callback:function(){
    pauseMediaPlayer();
}});

sio_hooks.push({event:'stop', callback:function(){
    stopMediaPlayer();
}});
    

function getMediaPlayerStatus(){
    if(mediaplayer){
        mediaplayer.stdin.write('status\n'); // send 'status'
    }
}

function connectToMediaPlayer(){
    
    if(exiting){return;}
    
    if(mediaplayer){
        system.doSioEmit('update', mediaplayerStatus);
        console.log('Media Player already initialised');
        return;
    }
    
    //connect to mediaplayer via telnet on 4991
    mediaplayer = spawn('telnet',['localhost','4991'],{cwd: process.cwd(), env: process.env, detached: true});
    
    mediaplayer.stdout.on('data', function (data) {
        var output = String(data).split("\n");
        for (var i = 0; i < output.length; i++) {
            if(output[i].indexOf('state playing')>=0){
                mediaplayerStatus.playing = 1;
            } else if(output[i].indexOf('state stopped')>=0){
                mediaplayerStatus.playing = 0;
            } else if(output[i].indexOf('state paused')>=0){
                mediaplayerStatus.playing = 2;
                
            }
        }
        system.doSioEmit('update', mediaplayerStatus);
    });
    
    mediaplayer.on('error', function (err) {
        console.log('Failed to connect to mediaplayer.');
    });

    mediaplayer.on('exit', function (code) {
        console.log('Connection to mediaplayer exited with code ' + code + '\nReconnecting...');
        mediaplayer.kill('SIGKILL');
        mediaplayer = 0;
        mediaplayerStatus.connected = 0;
        system.releaseResource('display');
        system.doSioEmit('update', mediaplayerStatus);
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
    
    if(!mediaplayer){
        system.doSioEmit('update', mediaplayerStatus);
        console.log('mediaplayer Offline');
        return;
    }
    
    if(!system.acquireResource('display')){
        system.doSioEmit('update', mediaplayerStatus);
        console.log('cannot acquire display');
        return;
    }
    
    //Acquire locks for ODD if playing from optical drive
    if(mrl.startsWith("dvd") || mrl.startsWith("cd") || mrl.startsWith("bluray")){
        if(!system.acquireResource('odd')){
            system.doSioEmit('update', mediaplayerStatus);
            console.log('cannot acquire optical drive');
            system.releaseResource('display');
            return;
        }
    }
    
    mediaplayer.stdin.write('stop\n'); // send 'stop'
    mediaplayer.stdin.write('clear\n'); // send 'clear'
    
    var now = new Date();
    
    mediaplayer.stdin.write('add '+mrl+'\n');
    console.log('add '+mrl+'\n');
    
    setTimeout(function(){
        getMediaPlayerStatus();
    }, 100);
    
}

function pauseMediaPlayer(){
    if(mediaplayer){
        mediaplayer.stdin.write('pause\n'); // send 'pause'
    }
    
    setTimeout(function(){
        getMediaPlayerStatus();
    }, 100);
}

function stopMediaPlayer(){
    if(mediaplayer){
        mediaplayer.stdin.write('stop\n'); // send 'stop'
        mediaplayer.stdin.write('clear\n'); // send 'clear'
    }
    
    system.releaseResource('display');
    system.releaseResource('odd');
    
    setTimeout(function(){
        getMediaPlayerStatus();
    }, 100);
}

function quitMediaPlayer(){
    if(mediaplayer){
        stopMediaPlayer();
        exiting = 1;
        mediaplayer.kill('SIGTERM');
        exiting = 0;
    }
}


