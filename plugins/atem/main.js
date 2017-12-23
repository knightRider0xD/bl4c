var atem = 0;
var atemStatus = {atem:0,program:0,preview:0,aux:0,ftb:0,transLength:0.6,audioChannels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],dsk:[{live:false,tie:false},{live:false,tie:false}]};
var atemALvls = {audioLevels:[[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100],[-100,-100]]};
var aLvlInterval = 4;
var aLvlCount = 0;
var inMutex = 0;
var aPreMutex = 0;

var spawn  = require('child_process').spawn;
var system = null;
var sio_hooks = [];

var config = {
        "ip": "192.168.10.240",
        "fps": 50,
        "alvl_frequency": 4,
        "alvl_presets": [ {"audioChannels":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]},
                    {"audioChannels":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[1,-5],[0,0],[0,0]]},
                    {"audioChannels":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[1,-10],[0,0],[0,0]]},
                    {"audioChannels":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[1,-10],[0,0],[1,-10],[0,0],[0,0]]} ]
};

exports.load = function (main_sys) {

    system = main_sys;
    
    system.setConfigDefaults(config);
    config = system.getConfig();
    
    system.registerSioEvent('connected', function(){
        system.doSioEmit('update', atemStatus);
    });
    
    for(var i=0; i<sio_hooks.length; i++){
       system.registerSioEvent(sio_hooks[i].event, sio_hooks[i].callback); 
    }
    
    connectToAtem();
    
}

exports.unload = function () {
    stopAtemConnection();
}

exports.notify = function (signalName, value) {
    //Do not need any updates
}

// Socket.IO Callbacks

sio_hooks.push({event:'changeProgram', callback:function(change){
    if(change.trans == 'cut'){
        sendAtemInput('SET PREV '+change.input);
        sendAtemInput('DO CUT');
    } else if(change.trans == 'mix'){
        sendAtemInput('SET PREV '+change.input);
        sendAtemInput('DO TRANS');
    } else {
        sendAtemInput('SET PROG '+change.input);
    }
}});

sio_hooks.push({event:'setPreview', callback:function(input){
    sendAtemInput('SET PREV '+input);
}});

sio_hooks.push({event:'setAux', callback:function(input){
    sendAtemInput('SET AUXSRC 0 '+input);
}});

sio_hooks.push({event:'setTransLength', callback:function(time){
    sendAtemInput('SET TMIXFRAMES '+ Math.round( time*config.fps ));
}});

sio_hooks.push({event:'setAudioMute', callback:function(input){
    sendAtemInput('SET AINSTATE '+input.channel+' '+input.mute);
}});

sio_hooks.push({event:'setAudioVolume', callback:function(input){
    if(input.channel>0){
        sendAtemInput('SET AINGAIN '+input.channel+' '+input.volume);
    } else {
        sendAtemInput('SET AMSTRGAIN '+input.volume);
    }
    
}});

sio_hooks.push({event:'runAudioPreset', callback:function(input){
    runAudioPreset(input);        
}});


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
            system.doSioEmit('alvls', atemALvls);
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
        system.doSioEmit('update', atemStatus);
        break;
    case "AMSTRGAIN:":
        var gain = parseFloat(cmd[1]);
        if(isNaN(gain)){gain=-60;} // -inf input
        atemStatus.audioChannels[0][1] = gain;
        system.doSioEmit('update', atemStatus);
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
        system.doSioEmit('update', atemStatus);
        break;
    //case "AINBAL:":
    //  system.doSioEmit('update', atemStatus);
    //  break;
    case "PROG:":
        atemStatus.program = parseInt(cmd[1]);
        system.doSioEmit('update', atemStatus);
        break;
    case "PREV:":
        atemStatus.preview = parseInt(cmd[1]);
        system.doSioEmit('update', atemStatus);
        break;
    case "AUX:":
        if(parseInt(cmd[2])==0){
            atemStatus.aux = parseInt(cmd[4]);
            system.doSioEmit('update', atemStatus);
        }
        break;
    //case "TSTYLE:":
    //    
    //    break;
    case "TMIXFRAMES:":
        transLength = parseInt(cmd[1]);
        if (isNaN(transLength)) { break; }
        atemStatus.transLength = transLength/50.0;
        system.doSioEmit('update', atemStatus);
        break;
    case "DSKEY:":
        keyer = parseInt(cmd[2]);
        if (isNaN(keyer)) { break; }
        atemStatus.dsk[keyer].live = (cmd[4] == 'true');
        system.doSioEmit('update', atemStatus);
        break;
    case "DSKTIE:":
        keyer = parseInt(cmd[2]);
        if (isNaN(keyer)) { break; }
        atemStatus.dsk[keyer].tie = (cmd[4] == 'true');
        system.doSioEmit('update', atemStatus);
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
        var target = config.alvl_presets[input].audioChannels;
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
    
    
    atem = spawn('./atem-cli', [config.ip],{cwd: process.cwd(), env: process.env, detached: true});
    
    atemStatus.atem = 1;
    system.doSioEmit('update', atemStatus);

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
        system.doSioEmit('update', atemStatus);
        
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
