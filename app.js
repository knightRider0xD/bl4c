var express         = require('express');
var path            = require('path');
var fs              = require('fs');
var favicon         = require('serve-favicon');
var logger          = require('morgan');
var cookieParser    = require('cookie-parser');
var bodyParser      = require('body-parser');
var routes          = require('./routes/index');
var users           = require('./routes/users');

var config = require('nconf');

config.file('config/config.json');
config.defaults({
    "global": {
        "ip": "192.168.10.232"
    },
    "http": {
        "port": 8080
    },
    "live_stream": {
        "port": 5000
    },
    "mplayer": {
        "port": 4991
    }
});

//
var plugins = {};

// global vars
var exiting = 0;
var my_ip  = config.get('global:ip');

// HTTP & SIO Vars
var httpPort    = config.get('http:port');
var app         = 0;
var http        = 0;
var io          = 0;
var sioSockets  = [];
var sioEvents   = [];
var sioConnects = [];
var sleep       = require('sleep');
var spawn       = require('child_process').spawn;
//var fs        = require("fs");


// Media Player Vars
var mplayerStatus = {connected:0,playing:0};
var mplayerPort = config.get('mplayer:port');
var mplayer = 0;
var mplayerWait = 0;





function PluginConnector(name) {
    this.pluginName = name;
}

PluginConnector.prototype.sendNotice = function(signalName, value) {
    for (var i=0; i<plugins.length; i++){
        try {
            plugins[i].notify(this.pluginName+'_'+signalName, value);
        } catch (err) {
            console.log("Error in cross-plugin-communication:\n"+this.pluginName+" notifying "+Object.keys(plugins)[i]+"\nSignal: "+signalName+"\nValue: "+value.toString()+"\nError: "+err;
        }
    }
}

//Register callbacks for Socket.IO events
PluginConnector.prototype.registerSioEvent = function(eventName, callback) {
    if ( eventName === 'connected' ) {
        sioConnects.push({'callback':callback});
    } else {
        sioEvents.push({'name':this.pluginName+'_'+eventName, 'callback':callback});
        socket.disconnect('Resetting connection to register new server plugin.');
    }
}

PluginConnector.prototype.doSioEmit = function(signalName, value) {
    io.emit(this.pluginName+'_'+signalName, value);
}

PluginConnector.prototype.getConfig = function() {
    return config.get(this.pluginName);
}

PluginConnector.prototype.getConfig = function(key) {
    return config.get(this.pluginName+':'+key);
}

PluginConnector.prototype.setConfigDefaults = function(object) {
    config.defaults({this.pluginName: object});
}

PluginConnector.prototype.setConfig = function(key, value) {
    config.set(this.pluginName+':'+key, value);
}

PluginConnector.prototype.getGlobalConfig = function() {
    return config.get('global');
}

PluginConnector.prototype.getGlobalConfig = function(key) {
    return config.get('global:'+key);
}


function loadPlugins(){
    
    var blacklist = '';
    
    if (fs.existsSync('./plugins/blacklist.txt')) {
        blacklist = fs.readFileSync('./plugins/blacklist.txt', 'utf8').split('\n');
    }
    
    out = fs.readdirSync('./plugins/');
    for (var i=0; i<out.length; i++){
        if (fs.lstatSync('./plugins/'+out[i]).isDirectory() && fs.existsSync('./plugins/'+out[i]+'/main.js')) {
            if( blacklist.indexOf(out[i]) >= 0 ){
                continue;
            }
            //plugin folder
            plugins[out[i]] = require('./plugins/'+out[i]+'/main');
            plugins[out[i]].load(new PluginConnector(out[i]));
        }
        
    }
    
}

function unloadPlugins(){
    
    var keys = Object.keys(plugins);
    
    while (plugins.length>0){
        try {
            plugins[plugins.length-1].unload();
        } catch (err) {
            console.log("Error while unloading plugin "+keys[plugins.length-1]+": "+err)
        }
        plugins.pop();
    }
    
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
/**********    HTTP Server & Socket.IO   **********/
/**************************************************/

function initApp(){
    
    app = express();

    // view engine setup
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'jade');

    // uncomment after placing your favicon in /public
    //app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
    app.use(logger('dev'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'public')));

    app.use('/', routes);
    app.use('/users', users);

    // catch 404 and forward to error handler
    app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
    });

    // error handlers

    // development error handler
    // will print stacktrace
    if (app.get('env') === 'development') {
        app.use(function(err, req, res, next) {
                res.status(err.status || 500);
                res.render('error', {
                message: err.message,
                error: err
            });
        });
    }

    // production error handler
    // no stacktraces leaked to user
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: {}
        });
    });


    //module.exports = app;
    
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
        //Add to the list of active sockets
        sioSockets.push(socket);
        
        socket.on('disconnect', function(){
            console.log('User disconnected');
            
            //Remove from list of active sockets
            const index = sioSockets.indexOf(socket);
            if (index !== -1) {
                sioSockets.splice(index, 1);
            }
        });
        
        //Register listeners to plugin callbacks
        for (var i=0; i<sioEvents.length; i++){
            socket.on(sioEvents[i].name, function(){
                try {
                    sioEvents[i].callback.apply(this, arguments);
                } catch (err) {
                    console.log("Error while running Socket.IO event "+sioEvents[i].name+": "+err);
                }
            });
        }
        
        //Run any registered connect callbacks for plugins.
        for (var i=0; i<sioConnects.length; i++){
            try {
                sioConnects[i].callback();
            } catch (err) {
                console.log("Error while running Socket.IO connection: "+err);
            }
        }
        
        /*
        
        
        
        
        socket.on('playMedia', function(media){
            playMediaPlayer(media);
        });
        
        socket.on('pauseMedia', function(){
            pauseMediaPlayer();
        });
        
        socket.on('stopMedia', function(){
            stopMediaPlayer();
        });
    
        */
        
    });

}

function cleanup(){
    quitMediaPlayer();
    quitRecorder();
    stopPublisher();
    stopAtemConnection();
    exiting = 1;
    process.exit(0);
}

//process.on('exit', function () {console.log('Exiting. Cleaning Up...'); cleanup();});
process.on('SIGINT', function () {console.log('SIGINT received.'); process.exit();});
process.on('SIGTERM', function () {console.log('SIGTERM received.'); process.exit();});
process.on('uncaughtException', function(e) {console.log('Uncaught Exception!\n'+e); process.exit();});//initHttp();});

initApp();
initHttp();
//initSIO();

loadPlugins();

//connectToMediaPlayer();
