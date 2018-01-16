var express         = require('express');
var path            = require('path');
var fs              = require('fs');
var favicon         = require('serve-favicon');
var logger          = require('morgan');
var cookieParser    = require('cookie-parser');
var bodyParser      = require('body-parser');
var routes          = require('./routes/index');
var users           = require('./routes/users');
var sleep           = require('sleep');
var spawn           = require('child_process').spawn;

var config = require('nconf');

config.file('config/config.json');
config.defaults({
    "global": {
        "ip": "192.168.10.232",
        "http_port": 8080,
        "live_stream": 5000
    },
    "resources": {
        'hdd':1,
        'odd':1,
        'display':1
    },
    "http": {
        "port": 8080
    },
    "live_stream": {
        "port": 5000
    }
});

//
var plugins = {};

//
var resources = config.get('resources');

// global vars
var exiting = 0;
var global_config = config.get('global');
config.set('global', global_config);
config.save();

// HTTP & SIO Vars
var app         = 0;
var http        = 0;
var io          = 0;
var sioSockets  = [];
var sioEvents   = [];
var sioConnects = [];


function PluginConnector(name) {
    this.pluginName = name;
}

PluginConnector.prototype.sendNotice = function(signalName, value) {
    for (var i=0; i<plugins.length; i++){
        try {
            plugins[i].notify(this.pluginName+'_'+signalName, value);
        } catch (err) {
            console.log("Error in cross-plugin-communication:\n"+this.pluginName+" notifying "+Object.keys(plugins)[i]+"\nSignal: "+signalName+"\nValue: "+value.toString()+"\nError: "+err);
        }
    }
}

//Register callbacks for Socket.IO events
PluginConnector.prototype.registerSioEvent = function(eventName, callback) {

    if ( eventName === 'connected' ) {
        var callback_shell = function(){
            try {
                callback();
            } catch (err) {
                console.log("Error while running Socket.IO connection: "+err);
            }
        };
        sioConnects.push({'callback':callback_shell});
    } else {
        var pluginName = this.pluginName;
        var callback_shell = function(){
            try {
                console.log("Socket.IO received "+pluginName+'_'+eventName+": "+arguments);
                callback.apply(this, arguments);
            } catch (err) {
                console.log("Error while running Socket.IO event "+pluginName+'_'+eventName+": "+err);
            }
        };
        
        sioEvents.push({'name':this.pluginName+'_'+eventName, 'callback':callback_shell});
        //socket.disconnect('Resetting connection to register new server plugin.');
    }
}

PluginConnector.prototype.doSioEmit = function(signalName, value) {
    io.emit(this.pluginName+'_'+signalName, value);
}

// Emit signal to sockets at particular IP addresses
PluginConnector.prototype.doSioEmitTarget = function(addresses, signalName, value) {
    if(!addresses.isArray()){
        return;
    }
    for(var i=0; i<sioSockets.length; i++){
        if (addresses.indexOf(sioSockets[i].handshake.address) >= 0){
            sioSockets[i].emit(this.pluginName+'_'+signalName, value);
        }
    }
}

PluginConnector.prototype.getConfig = function(key) {
    if (key === undefined){
        return config.get(this.pluginName);
    } else {
        return config.get(this.pluginName+':'+key);
    }
}

PluginConnector.prototype.setConfigDefaults = function(object) {
    //Set defaults
    var defaults_obj = {};
    defaults_obj[this.pluginName] = object;
    config.defaults(defaults_obj);
    //Re-write current config into config file, saving any defaults.
    var curr_config = config.get(this.pluginName);
    config.set(this.pluginName, curr_config);
    config.save();
}

PluginConnector.prototype.setConfig = function(key, value) {
    config.set(this.pluginName+':'+key, value);
    config.save();
}

PluginConnector.prototype.getGlobalConfig = function(key) {
    if (key === undefined){
        return config.get('global');
    } else {
        return config.get('global:'+key);
    }
}

PluginConnector.prototype.checkResource = function(resourceName) {
    return resources[resourceName] == '';
}

PluginConnector.prototype.acquireResource = function(resourceName) {
    if(resources[resourceName] == ''){
        resources[resourceName] = this.pluginName;
        return true;
    } else {
        return false;
    }
}

PluginConnector.prototype.releaseResource = function(resourceName) {
    if(resources[resourceName] == this.pluginName){
        resources[resourceName] = '';
        return true;
    } else {
        return false;
    }
}


function loadPlugins(){
    
    var blacklist = '';
    
    if (fs.existsSync('./plugins/blacklist.txt')) {
        blacklist = fs.readFileSync('./plugins/blacklist.txt', 'utf8').split('\n');
    }
    
    console.log("The following modules are blacklisted: "+blacklist.toString());
    
    out = fs.readdirSync('./plugins/');
    for (var i=0; i<out.length; i++){
        if (fs.lstatSync('./plugins/'+out[i]).isDirectory() && fs.existsSync('./plugins/'+out[i]+'/main.js')) {
            if( blacklist.indexOf(out[i]) >= 0 ){
                continue;
            }
            //plugin folder
            plugins[out[i]] = require('./plugins/'+out[i]+'/main');
            plugins[out[i]].load(new PluginConnector(String(out[i])));
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


    module.exports = app;
    
}

// http
function initHttp(){
    
    if(!app){return;}
    
    http = require('http').Server(app);
    
    http.listen(global_config.http_port, function(){
        console.log('listening on '+global_config.ip+':'+global_config.http_port);
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
            socket.on(sioEvents[i].name+'', sioEvents[i].callback);
        }
        
        //Run any registered connect callbacks for plugins.
        for (var i=0; i<sioConnects.length; i++){
            sioConnects[i].callback();
        }
        
        
    });

}

function cleanup(){
    unloadPlugins();
    process.exit(0);
}

process.on('exit', function () {console.log('Exiting. Cleaning Up...'); cleanup();});
process.on('SIGINT', function () {console.log('SIGINT received.'); process.exit();});
process.on('SIGTERM', function () {console.log('SIGTERM received.'); process.exit();});
process.on('uncaughtException', function(e) {console.log('Uncaught Exception!\n'+e); process.exit();});//initHttp();});

initApp();
initHttp();
initSIO();

loadPlugins();
