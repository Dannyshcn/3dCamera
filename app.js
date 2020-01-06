
var version = '1.33';

var args = process.argv.slice(2);

var httpServer = 'http://192.168.10.100:8080';
var socketServer = 'http://192.168.10.100:3000/';
if (typeof args[0] != 'undefined') {		
    socketServer = 'http://' + args[0];		
}
if (typeof args[1] != 'undefined') {		
    httpServer = 'http://' + args[1];		
}

var spawn = require('child_process').spawn;
var exec  = require('child_process').exec;
var childProcess;

var path = require('path');

var socket = require('socket.io-client')(socketServer);

var fs = require('fs');

var FormData = require('form-data');
var request  = require('request');

var os     = require('os');

// Random name generator
var marvel = require('marvel-characters')

var lastReceiveTime;
var photoStartTime;
var takeId;
var updateInProgress = false;

var imagePath = '/';
var imageName = 'output.jpg';

var deviceNamePath = path.join(__dirname, "/device-name");

var cameraName = null;
var ipAddress  = null;
var hostName   = null;
var extraWebCams = 4;

function boot() {
    console.log("Starting");
    
    hostName = os.hostname();
    
    // Lookup our IP address
    lookupIp();
    
    // Set the device name, either a default or from storage
    cameraName = marvel();
    fs.readFile(deviceNamePath, function(err, buffer){
        if (typeof buffer == 'undefined') {
            return;
        }
        var savedName = buffer.toString();
        if (savedName) {
            cameraName = savedName;
            console.log('saved device name', cameraName);
        }
    });
    
    console.log("Startup complete");
}

socket.on('connect', function(){
    console.log('A socket connection was made');
    
    socket.emit('camera-online', {name: cameraName, ipAddress: ipAddress, version: version});
    
    //Add support for multiple webcams
    //var _camRange  = 2 * ( extraWebCams + 1 );
    
    //for ( var i=0; i<_camRange; i+=2 ){    //stride for 2
    //    var camID = _cam + i;       //The camera ID
    //    if ( fs.existsSync( camID )){
    //        socket.emit('camera-online', {name: cameraName + '-' + camID, ipAddress: ipAddress, version: version});
    //    }
    //}
    
    // Setup a regular heartbeat interval
    var heartbeatIntervalID = setInterval(heartbeat, 1000);
});

socket.on('take-photo', function(data){
    console.log("Taking a photo");
    
    photoStartTime  = Date.now();
    lastReceiveTime = data.time
    takeId          = data.takeId;
    
    takeImage();
});

socket.on('take-photo-DSLR', function(data){
    console.log("Taking a photo");
    
    photoStartTime  = Date.now();
    lastReceiveTime = data.time
    takeId          = data.takeId;
    
    takeImage_DSLR();
});

socket.on('execute-command', function(data){
    console.log( "Execute : " + data.command );
    var buffer = data.command.split(" ");
    var cmd = String(buffer.splice(0,1));
    var args = buffer;

    execute( data.command );
});

socket.on('lights-switch', function(data){
    if ( fs.existsSync('/home/pi/3dCamera/led_control.py')) { //file exists
        // execute( 'python led_control.py ' + data  );
       if ( 'on' == data ) {
           execute( 'python /home/pi/3dCamera/led_control.py -s on' );
       }else{
           execute( 'pkill -15 -f "python /home/pi/3dCamera/led_control.py"' );
       }

       console.log( "Lights :" + data );
    }
});

socket.on('take-photo-webcam', function(data){
    takeImage_WebCam(data);
});

socket.on('update-software', function(data){
    console.log("Updating software");
    
    updateInProgress = true;

    updateSoftware();
});

socket.on('update-name', function(data){
    
    // Name updates go to all devices so only respond if its comes with the devices ip address
    if (data.ipAddress != ipAddress) {
        return;
    }
        
    // If we have a proper name update the camera name, if its being reset switch back to a marvel character
    if (data.newName) {
        cameraName = data.newName;
    } else {
        cameraName = marvel();
    }

    fs.writeFile(deviceNamePath, cameraName, function(err) {
        if (err) {
            console.log("Error saving the device name");
        }
    });

});

function heartbeat() {
    if (ipAddress == null) {
        lookupIp();
    }
    socket.emit('camera-online', {name: cameraName, ipAddress: ipAddress, hostName: hostName, version: version, updateInProgress: updateInProgress});
}

function getAbsoluteImagePath() {
    return path.join(__dirname, imagePath, imageName);
}

function lookupIp() {
    var ifaces = os.networkInterfaces();
    Object.keys(ifaces).forEach(function (ifname) {
      var alias = 0;

      ifaces[ifname].forEach(function (iface) {
        if ('IPv4' !== iface.family || iface.internal !== false) {
          // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
          return;
        }
        ipAddress = iface.address;
      });
    });
}

function sendImage(code) {
    
    //console.log("Photo capture complete, status code:" + code);
    
    // A success should come back with exit code 0
    if (code !== 0) {
        socket.emit('photo-error', {takeId:takeId, msg:"Capture failure"});
        return;
    }
    
    socket.emit('sending-photo', {takeId:takeId});
    
    fs.readFile(getAbsoluteImagePath(), function(err, buffer){
        if (typeof buffer == 'undefined') {
            socket.emit('photo-error', {takeId:takeId, msg:"Missing image " + ipAddress "-" + getAbsoluteImagePath()});
            return;
        }
        
        var totalDelay = Date.now() - lastReceiveTime;
        var imageDelay = Date.now() - photoStartTime;
        socket.emit('new-photo', {
            //data: buffer.toString('base64'), 
            takeId:takeId, 
            startTime:lastReceiveTime, 
            time:Date.now(), 
            photoStartTime:photoStartTime,
            totalDelay: totalDelay,
            imageDelay: imageDelay,
            fileName: fileName
        });
    });
    
    var fileName = guid() + '.jpg';
    
    // Post the image data via an http request
    var form = new FormData();
    form.append('takeId', takeId);
    form.append('startTime', lastReceiveTime);
    form.append('cameraName', cameraName);
    form.append('fileName', fileName);
    form.append('image', fs.createReadStream(getAbsoluteImagePath()));

    form.submit(httpServer + '/new-image', function(err, res) {
        if (err) {
            socket.emit('photo-error', {takeId:takeId, msg:"Upload Failure"});
        } else {
            console.log("Image uploaded");
        }
        
        fs.unlink(getAbsoluteImagePath(), function () {
            // file deleted
        });
        
        res.resume();
    });
}

function sendImage_WebCam( code, imagePath, timeInfo ) {
    
    //console.log("Photo capture complete, status code:" + code);
    
    // A success should come back with exit code 0
    if (code !== 0) {
        socket.emit('photo-error', {takeId:takeId});
        return;
    }
    
    socket.emit('sending-photo', {takeId:takeId});
    
    fs.readFile(imagePath, function(err, buffer){
        if (typeof buffer == 'undefined') {
            socket.emit('photo-error', {takeId:takeId});
            return;
        }
        
        var totalDelay = Date.now() - timeInfo.lastReceiveTime;
        var imageDelay = Date.now() - timeInfo.photoStartTime;
        socket.emit('new-photo', {
            //data: buffer.toString('base64'), 
            takeId:takeId, 
            startTime:timeInfo.lastReceiveTime, 
            time:Date.now(), 
            photoStartTime:timeInfo.photoStartTime,
            totalDelay: totalDelay,
            imageDelay: imageDelay,
            fileName: fileName
        });
    });
    
    var fileName = guid() + '.jpg';
    
    // Post the image data via an http request
    var form = new FormData();
    form.append('takeId', timeInfo.takeId);
    form.append('startTime', timeInfo.lastReceiveTime);
    form.append('cameraName', timeInfo._cameraName);
    form.append('fileName', fileName);
    form.append('image', fs.createReadStream(imagePath));

    form.submit(httpServer + '/new-image', function(err, res) {
        if (err) {
            socket.emit('photo-error', {takeId:timeInfo.takeId});
        } else {
            console.log("Image uploaded");
        }
        
        fs.unlink(imagePath, function () {
            // file deleted
        });
        
        res.resume();
    });
}

 //@Lip Execute command
function execute( cmd ) {
    var process = spawn('bash');
    process.stdout.on('data', function(data){
        console.log('stdout: ' + data);
    });
 
     //@Lip max 1hour running time
    var watcher = setTimeout(function(){
        console.log("Force exit");
        process.exit();
    }, 3600000);
    
    process.on('exit', function(code){
        clearTimeout( watcher );
        if (code !== 0) {
            socket.emit('command-error', {takeId:takeId, message:cmd + ' - error '});
            return;
        }
        socket.emit('command-finished', {takeId:takeId, message:cmd + ' - done '});
    });
    
    process.stdin.write( cmd + '\n' );
    process.stdin.end();
}

function takeImage() {
    var args = [
        //'-w', 2592,   // width
        //'-h', 1944,  // height
        //'-t', 100,  // how long should taking the picture take?
        '-q', 100,     // quality
	'-fli', 'auto',	//Anti flickering
	'-gps',
	'-vf',		//Vertial flip
	'-r',		//Raw layer
        '-awb', 'fluorescent', 
        '-o', getAbsoluteImagePath()   // path + name
    ];
    var imageProcess = spawn('raspistill', args);
    // The image should take about 5 seconds, if its going after 10 kill it!
    setTimeout(function(){ imageProcess.kill()}, 10000);
    
    imageProcess.on('exit', sendImage);
}

function takeImage_DSLR() {
    var args = [ 
        '/home/pi/3dCamera/camera_capture.py',  // path + name
        getAbsoluteImagePath()
    ];
    var imageProcess = spawn('python', args);
    // The image should take about 5 seconds, if its going after 10 kill it!
    setTimeout(function(){ imageProcess.kill()}, 5000);
    
    imageProcess.on('exit', sendImage);
}

function takeImage_WebCam(data) {
    var _imageName = 'output';
    var _imageExt  = '.jpg';
    var _cam       = '/dev/video';
    var _camRange  = 2 * ( extraWebCams + 1 );
    
    for ( var i=0; i<_camRange; i+=2 ){    //stride for 2
        var camID = _cam + i;       //The camera ID
        if ( fs.existsSync( camID )){
            console.log( "Taking a photo-WebCam: " + camID );
    
            var timeInfo    = {
                photoStartTime  : Date.now(),
                lastReceiveTime : data.time,
                takeId          : data.takeId,
                _cameraName      : cameraName + '-' + camID
            };            
            
            var imagePath = path.join( __dirname, _imageName + i.toString() + _imageExt );   //The image name
            var p = spawn('fswebcam',['-p','YUYV','-r','1920x1080','-i','0','-d',camID,'--no-banner',imagePath]);
            // The image should take about 5 seconds, if its going after 10 kill it!
            setTimeout( function(){ p.kill()}, 5000 );
            p.on( 'exit', function( code ){ sendImage_WebCam( code, imagePath, timeInfo );});
        }
    }
}

// To update the software we run git pull and npm install and then forcibily kill this process
// Supervisor will then restart it
function updateSoftware() {
    childProcess = exec('cd ' + __dirname + '; git pull', function (error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error !== null) {
            console.log('exec error: ' + error);
        }
        process.exit();
    });
}
  
function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}

// Run the boot sequence
boot();
