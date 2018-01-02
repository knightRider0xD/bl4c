var atem = 0;
var atemStatus = {atem:0,program:0,preview:0,aux:0,ftb:0,transLength:0.6,audioChannels:{"0":[0,0],"1":[0,0],"2":[0,0],"3":[0,0],"4":[0,0],"5":[0,0],"6":[0,0],"7":[0,0],"8":[0,0], "1001":[0,0], "1201":[0,0]},dsk:[{live:false,tie:false},{live:false,tie:false}]};
var atemALvls = {audioLevels:{"0":[-100,-100],"1":[-100,-100],"2":[-100,-100],"3":[-100,-100],"4":[-100,-100],"5":[-100,-100],"6":[-100,-100],"7":[-100,-100],"8":[-100,-100], "1001":[-100,-100], "1201":[-100,-100]}};
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
        "alvl_presets": [   {"audioChannels":  {"1":[0,0],"2":[0,0],"3":[0,0],"4":[0,0],"5":[0,0],"6":[0,0],
                                                "7":[0,0],"8":[0,0], "1001":[0,0], "1201":[0,0]}},
                            {"audioChannels":  {"1":[0,0],"2":[0,0],"3":[0,0],"4":[0,0],"5":[0,0],"6":[0,0],
                                                "7":[0,0],"8":[0,0], "1001":[0,0], "1201":[1,-5]}},
                            {"audioChannels":  {"1":[0,0],"2":[0,0],"3":[0,0],"4":[0,0],"5":[0,0],"6":[0,0],
                                                "7":[0,0],"8":[0,0], "1001":[0,0], "1201":[1,-10]}},
                            {"audioChannels":  {"1":[0,0],"2":[0,0],"3":[0,0],"4":[0,0],"5":[0,0],"6":[0,0],
                                                "7":[0,0],"8":[0,0], "1001":[1,-10], "1201":[1,-10]}}    ]
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
    if (change.input % 1000 == 5){
        //Set Keyers
        var targetKeyer = ((change.input-5000) % 10)-1;
        for(var i=0; i<atemStatus.dsk.length; i++){
            if((atemStatus.dsk[i].live == true && i != targetKeyer)||(atemStatus.dsk[i].live == false && i == targetKeyer)){
                sendAtemInput('SET DSKTIE '+i+' '+1);
            } else {
                sendAtemInput('SET DSKTIE '+i+' '+0);
            }
        }
        //Do Trans
        if(change.trans == 'cut'){
            sendAtemInput('DO CUT');
        } else if(change.trans == 'mix'){
            sendAtemInput('DO TRANS');
        } else {
            var currPrev = atemStatus.preview;
            sendAtemInput('DO CUT');
            sendAtemInput('SET PREV '+currPrev);
        }
    } else {
        //Clear Keyers
        for(var i=0; i<atemStatus.dsk.length; i++){
            if(atemStatus.dsk[i].live && !atemStatus.dsk[i].tie){
                sendAtemInput('SET DSKTIE '+i+' '+1);
            } else if(!atemStatus.dsk[i].live && atemStatus.dsk[i].tie){
                sendAtemInput('SET DSKTIE '+i+' '+0);
            }
        }
        //Do Trans
        if(change.trans == 'cut'){
            sendAtemInput('SET PREV '+change.input);
            sendAtemInput('DO CUT');
        } else if(change.trans == 'mix'){
            sendAtemInput('SET PREV '+change.input);
            sendAtemInput('DO TRANS');
        } else {
            sendAtemInput('SET PROG '+change.input);
        }
    }
    
}});

sio_hooks.push({event:'setPreview', callback:function(input){
    if (change.input % 1000 == 5){
        //Set Keyers
        var targetKeyer = ((change.input-5000) % 10)-1;
        for(var i=0; i<atemStatus.dsk.length; i++){
            if((atemStatus.dsk[i].live == true && i != targetKeyer)||(atemStatus.dsk[i].live == false && i == targetKeyer)){
                sendAtemInput('SET DSKTIE '+i+' '+1);
            } else {
                sendAtemInput('SET DSKTIE '+i+' '+0);
            }
        }
    } else {
        //Clear Keyers
        for(var i=0; i<atemStatus.dsk.length; i++){
            if(atemStatus.dsk[i].live && !atemStatus.dsk[i].tie){
                sendAtemInput('SET DSKTIE '+i+' '+1);
            } else if(!atemStatus.dsk[i].live && atemStatus.dsk[i].tie){
                sendAtemInput('SET DSKTIE '+i+' '+0);
            }
        }
        sendAtemInput('SET PREV '+change.input);
    }
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
    if(input.channel!='0'){
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
        var chnl = cmd[2];
        var lLvl = parseFloat(cmd[4]);
        var rLvl = parseFloat(cmd[5]);
        
        if(isNaN(lLvl)){lLvl=-100;}
        if(isNaN(rLvl)){rLvl=-100;}
        
        atemALvls.audioLevels[chnl][0] = lLvl;
        atemALvls.audioLevels[chnl][1] = rLvl;
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
        atemALvls.audioLevels['0'][0] = lLvl;
        atemALvls.audioLevels['0'][1] = rLvl;
        break;
    case "AINGAIN:":
        var chnl = cmd[2];
        var gain = parseFloat(cmd[4]);
        if(isNaN(gain)){gain=-60;} // -inf input
        atemStatus.audioChannels[chnl][1] = gain;
        system.doSioEmit('update', atemStatus);
        break;
    case "AMSTRGAIN:":
        var gain = parseFloat(cmd[1]);
        if(isNaN(gain)){gain=-60;} // -inf input
        atemStatus.audioChannels['0'][1] = gain;
        system.doSioEmit('update', atemStatus);
        break;
    case "AINSTATE:":
        var chnl = cmd[2];
        var state = parseInt(cmd[4]);
        atemStatus.audioChannels[chnl][0] = state;
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


function runAudioPreset(presetId){
    
    // Check if a present is already running. If so, abort. If not, mark as preset running.
    if(aPreMutex){
        return;
    }
    aPreMutex = 1;
    
    // Create a clone of the original audioChannels state
    var orig = JSON.parse(JSON.stringify(atemStatus.audioChannels));
    
    var current = atemStatus.audioChannels;
    var target = config.alvl_presets[presetId].audioChannels;
    var increment = {};
    
    for (const chnl in target) {
        
        // If target Channel ID not present, skip.
        if(!(chnl in current)){
            continue;
        }
        
        // Modify inital/target positions to allow smooth fade
        if(current[chnl][0]  == 0 && target[chnl][0]  == 1) {
            // If currently muted but target is live, start unmuted with gain at -inf
            current[chnl][1]  = -60;
            sendAtemInput('SET AINGAIN '+chnl+' -60');
            sendAtemInput('SET AINSTATE '+chnl+' 1');
        } else if(current[chnl][0] == 1 && target[chnl][0] == 0) {
            // If currently live but target is muted, set target gain to -inf
            target[chnl][1] = -60;
        } else if(current[chnl][0] == 0  && target[chnl][0]  == 0) {
            // If currently muted and target also muted, match target gain to current to remain unchanged
            target[chnl][1] =  current[chnl][1];
        }
        
        // Setup increments at 1/20th of target value
        increment[chnl]  = (target[chnl][1]  - current[chnl][1])/20.0;
    }
    
    function doIncrement(i){
        if(i==0){
            return;
        }
        
        for (const chnl in increment) {
            // Calculate new gain at this increment
            current[chnl][1] += increment[chnl];
            
            // Send new gain target
            sendAtemInput('SET AINGAIN '+chnl+' '+current[chnl][1]);
        }
        
        // Repeat at 50ms intervals until i is 0
        setTimeout(function(){doIncrement(i-1);}, 50);
    }
    
    // Do increment 20x (@50ms) = 1s fade between start and target
    doIncrement(20);
    
    // After increments complete, mute & reset inputs
    setTimeout(function(){
        for (const chnl in increment) {
            // Calculate new gain at this increment
            if(current[1][0]  == 1 && target[1][0]  == 0) {
                sendAtemInput('SET AINSTATE '+chnl+' 0');
                sendAtemInput('SET AINGAIN '+chnl+' '+orig[chnl][1]);
            }
        }
        
        // Mark preset complete
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
