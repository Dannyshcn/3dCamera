
var version = '1.42a';

var args = process.argv.slice(2);

var httpServer = 'http://192.168.10.100:8080';
var socketServer = 'http://192.168.10.100:3000';
if (typeof args[0] != 'undefined') {		
    socketServer = 'http://' + args[0];		
}
if (typeof args[1] != 'undefined') {		
    httpServer = 'http://' + args[1];		
}

var spawn = require('child_process').spawn;
var spawnSync = require('child_process').spawnSync;
var exec  = require('child_process').exec;
var childProcess;

var path = require('path');

var socket = require('socket.io-client')(socketServer);

var fs = require('fs');

var FormData = require('form-data');
var request  = require('request');
var timesync = require('timesync');

var os     = require('os');

// Random name generator
var marvel = require('marvel-characters')

var lastReceiveTime;
var photoStartTime;
var photoStartTime_DSLR;
var takeId;
var updateInProgress = false;

var imagePath = '/';
var imageName = 'output.jpg';

var deviceNamePath = path.join(__dirname, "/device-name");

var cameraName = null;
var ipAddress  = null;
var hostName   = null;
var extraWebCams = 4;
var DSLR_BatteryLevel = "Disconnect";
var ts = timesync.create({
    server: socketServer+'/timesync',
    interval: 300000
});

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

socket.on('disconnect', function(){
    console.log("Disconnected");
});
    
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
    
    ts.sync();

    // Setup a regular heartbeat interval
    
    heartbeat();
    update_DSLR_Battery_Info();
    
    var heartbeatIntervalID = setInterval(heartbeat, 1000);
    var heartbeatIntervalID_battery = setInterval(update_DSLR_Battery_Info, 900000);
});

socket.on('timeSync-test', function(data){
    var commandIssueTime = data.time;
    var expectedRunningTime = commandIssueTime + data.countDown;
    var commandRecievedTime = ts.now();
    var offset = commandRecievedTime - commandIssueTime;
    var waitTime         = expectedRunningTime - commandRecievedTime - 1;
    
    if ( waitTime < 100 ){
        console.log( "The client cock is way ahead manager clock");
        waitTime = 0;
    }
    
    console.log( "Cmd Recieved delta: " + offset + " Time to wait: " + waitTime );
    setTimeout( function(){
        console.log("Time to Feed back");
        msg = { expectedRunTime: expectedRunningTime, networkLatency: offset, executionTime: ts.now() }
        socket.emit('timeSync-return', msg );
    }, waitTime );
});

socket.on('take-photo', function(data){
    console.log("Taking a photo" );

    lastReceiveTime = data.time
    takeId          = data.takeId;
    
    var expectedRunningTime = lastReceiveTime + data.countDown;
    var commandRecievedTime = ts.now();

    var waitTime         = expectedRunningTime - commandRecievedTime - 1;
    
    if ( waitTime < 0 ){    //Act immediately
        waitTime = 0;
    }
    
    takeImage_test( waitTime );
/*    
    setTimeout( function(){
        photoStartTime  = ts.now();
        takeImage();
        socket.emit('timeSync-return', { 
            networkLatency: commandRecievedTime - lastReceiveTime,
            executeDelta: photoStartTime- expectedRunningTime 
        } );
    }, waitTime );
    * */
});

socket.on('take-photo-DSLR', function(data){    
    kill_gphoto2_before_process(function(code){
        console.log("Taking a photo(DSLR)");
    });
            
    var lastReceiveTime_DSLR = data.time
    takeId          = data.takeId;
    
    var expectedRunningTime = lastReceiveTime_DSLR + data.countDown;
    var commandRecievedTime = ts.now();

    var waitTime         = expectedRunningTime - commandRecievedTime - 1;
    
    if ( waitTime < 0 ){    //Act immediately
        waitTime = 0;
    }
    
    takeImage_DSLR_test( waitTime );
    /*
    setTimeout( function(){
        photoStartTime_DSLR = ts.now();
        takeImage_DSLR();
        socket.emit('timeSync-return', { 
            networkLatency_DSLR: commandRecievedTime - lastReceiveTime_DSLR,
            executeDelta_DSLR: photoStartTime_DSLR - expectedRunningTime 
        } );
    }, waitTime );*/
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
      
    socket.emit('camera-online', {name: cameraName, ipAddress: ipAddress, hostName: hostName, version: version, updateInProgress: updateInProgress, DSLR_battery: DSLR_BatteryLevel});
}

function getAbsoluteImagePath() {
    return path.join(__dirname, imagePath, imageName);
}

function getAbsoluteImagePath_DSLR() {
    return path.join(__dirname, imagePath, "DSLR_" + imageName);
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

function update_DSLR_Battery_Info() {
    kill_gphoto2_before_process(function(code){
        var process = spawnSync('gphoto2 --get-config batterylevel', {
            shell: true,
        });
        var info = process.stdout.toString().split(/[\r\n]+/);
        for ( var i=0; i<info.length; ++i ){
        //console.log( info[i].split(/(\s+)/));
            var items = info[i].split(/(\s+)/);
            if ( 'Current:' == items[0]  ){
                DSLR_BatteryLevel = items[2];
                return;
            }
        }
        DSLR_BatteryLevel = "Disconnect";
    });
}

function sendImages(code) {
    if (code !== 0) {
        socket.emit('photo-error', {takeId:takeId, msg:"Capture failure-" + ipAddress });
        return;
    }
    socket.emit('sending-photo', {takeId:takeId});
    
    var imagePath = path.join( __dirname, 'pi_img' );
    var fileName = cameraName + '.jpg';
    // Post the image data via an http request
    var form = new FormData();
    form.append('socketId', socket.id);
    form.append('takeId', takeId);
    form.append('startTime', lastReceiveTime);
    form.append('cameraName', cameraName);
    form.append('fileName', fileName);
    form.append('images', fs.createReadStream(imagePath + '/image5.jpg'));
    form.append('images', fs.createReadStream(imagePath + '/image0.jpg'));


    form.submit(httpServer + '/new-images', function(err, res) {
        if (err) {
            socket.emit('photo-error', {takeId:takeId, msg:"Upload Failure"});
        } else {
            console.log("Images uploaded");
        }
        
        deleteFolderRecursive( imagePath );
        
        res.resume();
    });
}


function sendImages_DSLR(code) {
    if (code !== 0) {
        socket.emit('photo-error', {takeId:takeId, msg:"Capture failure(DSLR)-" + ipAddress });
        return;
    }
    socket.emit('sending-photo', {takeId:takeId});
    
    var imagePath = path.join( __dirname, 'dslr_img' );
    var fileName = cameraName + '_dslr.jpg';
    // Post the image data via an http request
    var form = new FormData();
    form.append('socketId', socket.id);
    form.append('takeId', takeId);
    form.append('startTime', lastReceiveTime);
    form.append('cameraName', cameraName);
    form.append('fileName', fileName);
    form.append('images', fs.createReadStream(imagePath + '/img_0002.jpg'));
    form.append('images', fs.createReadStream(imagePath + '/img_0001.jpg'));


    form.submit(httpServer + '/new-images', function(err, res) {
        if (err) {
            socket.emit('photo-error', {takeId:takeId, msg:"Upload Failure"});
        } else {
            console.log("Images uploaded");
        }
        
        deleteFolderRecursive( imagePath );
        
        res.resume();
    });
}


function sendImage(code) {
    
    //console.log("Photo capture complete, status code:" + code);
    
    // A success should come back with exit code 0
    if (code !== 0) {
        socket.emit('photo-error', {takeId:takeId, msg:"Capture failure-" + ipAddress });
        return;
    }
    
    socket.emit('sending-photo', {takeId:takeId});
    
    fs.readFile(getAbsoluteImagePath(), function(err, buffer){
        if (typeof buffer == 'undefined') {
            socket.emit('photo-error', {takeId:takeId, msg:"Missing image " + ipAddress + "-" + getAbsoluteImagePath()});
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
    
    //var fileName = guid() + '.jpg';
    var fileName = cameraName + '.jpg';
  
    // Post the image data via an http request
    var form = new FormData();
    form.append('socketId', socket.id);
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

function sendImage_DSLR(code) {
    
    //console.log("Photo capture complete, status code:" + code);
    
    // A success should come back with exit code 0
    if (code !== 0) {
        socket.emit('photo-error', {takeId:takeId, msg:"Capture failure(DSLR)-" + ipAddress });
        return;
    }
    
    socket.emit('sending-photo', {takeId:takeId});
    
    fs.readFile(getAbsoluteImagePath_DSLR(), function(err, buffer){
        if (typeof buffer == 'undefined') {
            socket.emit('photo-error', {takeId:takeId, msg:"Missing image(DSLR)-" + ipAddress + "-" + getAbsoluteImagePath_DSLR()});
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
    
    //var fileName = guid() + '.jpg';
    var fileName = cameraName + '_DSLR.jpg';
  
    // Post the image data via an http request
    var form = new FormData();
    form.append('socketId', socket.id);
    form.append('takeId', takeId);
    form.append('startTime', lastReceiveTime);
    form.append('cameraName', cameraName);
    form.append('fileName', fileName);
    form.append('image', fs.createReadStream(getAbsoluteImagePath_DSLR()));

    form.submit(httpServer + '/new-image', function(err, res) {
        if (err) {
            socket.emit('photo-error', {takeId:takeId, msg:"Upload Failure(DSLR)"});
        } else {
            console.log("Image uploaded(DSLR)");
        }
        
        fs.unlink(getAbsoluteImagePath_DSLR(), function () {
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
function execute( cmd, callback ) {
    var process = spawn('bash');
    process.stdout.on('data', function(data){
        console.log('stdout: ' + data);
    });
 
     //@Lip max 1hour running time
    var watcher = setTimeout(function(){
        console.log("Force exit");
        process.exit();
    }, 3600000);
    
    if ( undefined == callback ){
        callback = function(code){
            clearTimeout( watcher );
            if (code !== 0) {
                socket.emit('command-error', {takeId:takeId, message:cmd + ' - error '});
                return;
            }
            socket.emit('command-finished', {takeId:takeId, message:cmd + ' - done '});
        };
    }
    
    process.on('exit', callback );
    
    process.stdin.write( cmd + '\n' );
    process.stdin.end();
}

function kill_gphoto2_before_process( callback ){
    var _process;
	var isWin = process.platform === "win32";
	if ( !isWin ) {
		_process = spawn('bash');
	}else{
		_process = spawn('cmd');
	}
    _process.on('exit', callback);
    
    _process.stdout.on('data', function(data){
        var info = data.toString().split(/[\r\n]+/);
        for ( var i=0; i<info.length; ++i ){
            //console.log( info[i].split(/(\s+)/));
            var pid  = info[i].split(/(\s+)/)[2];
            if ( undefined == pid ){
                continue;
            }
            //console.log( info[i] + "\nPID is at " + i + " is " + pid );
            _process.stdin.write( 'kill ' + pid + "\n" );
        }

        _process.stdin.end();   //End the stream
    });
    _process.stdin.write( 'ps aux | grep -e gvfs-gphoto2 -e gvfsd-gphoto2\n' );
}

function takeImage_test( waitTime ) {
    var timeEnter = ts.now();
    
    var imageFolder = path.join(__dirname, 'pi_img');
    if (!fs.existsSync(imageFolder)){
        fs.mkdirSync(imageFolder);
    }
    //Since python uses the system time
    var codePath = path.join(__dirname, "pi_capture.py");
    var process = spawn('python', [codePath, Date.now() ,waitTime, imageFolder]);

    process.stdout.on('data', function(data){
        console.log('stdout: ' + data);
    });
    process.stderr.on('data', function(data){
        console.log('stderr: ' + data);
    });
 
    //@Lip max countDown time is 5mins
    var watcher = setTimeout(function(){
        console.log("Force exit: takeImages");
        process.exit();
    }, 60000);
    
    process.on('exit', function(code){
        clearTimeout( watcher );
        
        var exifTool = spawn('bash');
        
        exifTool.on('exit', sendImages );
        
        exifTool.stdout.on('data', function(data){
                console.log('stdout: ' + data);
        });

        exifTool.stdin.write("exiftool " +
                         "-FNumber=2.0 " +
                         "-Make=RaspberryPi " +
                         "-Model=RP_imx219 " + 
                         "-ApertureValue=2.0 " +
                         "-MaxApertureValue=2 " +
                         "-Artist=Lip " +
                         "-FocalLength=3mm " +
                         "-overwrite_original_in_place " +
                         imageFolder+"/*\n"
                         );
                     
        exifTool.stdin.end();
        
    });
}

function takeImage() {
    var args = [
        //'-w', 2460,   // width
        //'-h', 1848,  // height
        //'-t', 100,  // how long should taking the picture take?
        '-q', 100,     // quality
        '-ISO', 80,    //ISO
        '-ss', 16667,  //Shutter speed
	'-fli', 'auto',	//Anti flickering
	'-gps',
	//'-vf',		//Vertial flip
	//'-roi', '0.25,0.25,0.75,0.75',
	//'-r',		//Raw layer
        '-awb', 'incandescent', //'fluorescent', 
        '-o', getAbsoluteImagePath()   // path + name
    ];
    var imageProcess = spawn('raspistill', args);
    // The image should take about 5 seconds, if its going after 10 kill it!
    setTimeout(function(){ imageProcess.kill()}, 10000);
    
    imageProcess.on('exit', sendImage);
}

function takeImage_DSLR_test( waitTime ) {
    var timeEnter = ts.now();
       
    var process = spawn('bash');
    
/*    process.stdout.on('data', function(data){
        console.log('stdout: ' + data);
    });
*/ 
    //@Lip max countDown time is 5mins
    var watcher = setTimeout(function(){
        console.log("Force exit: takeImage_DSLR");
        process.exit();
    }, 60000);
    
    var imagePath = path.join(__dirname, 'dslr_img');
    console.log( imagePath );
    if (!fs.existsSync(imagePath)){
        fs.mkdirSync(imagePath);
        fs.chownSync(imagePath, 1000, 1000);
    }
    process.on('exit', function(){
        var args = [
		"--set-config-index", "/main/actions/eosremoterelease=0",
		"--get-all-files","--force-overwrite",
		"--filename="+imagePath+"/%:",
		"--delete-all-files", "-R"
        ];
        var imageProcess = spawn('gphoto2', args);
        
        imageProcess.on('exit', sendImages_DSLR);
    });
    
    process.stdin.write( 'gphoto2 --shell\n' );
    process.stdin.write( 'set-config-index drivemode=0\n' );
    process.stdin.write( 'set-config-index iso=3\n' );
        
    setTimeout( function() {
        process.stdin.write( 'set-config-index capturetarget=1\n' );
        process.stdin.write( 'set-config-index eosremoterelease=6\n' );
    }, waitTime - ts.now() + timeEnter - 1500 ); //focus 1.5s before image capture
    
    
    setTimeout( function() {
        //Take the images continuously
        process.stdin.write( 'set-config-index eosremoterelease=9\n' );
        process.stdin.write( 'set-config-index drivemode=1\n' );
        
        //console.log( ts.now());
        
        process.stdin.write( 'set-config-index eosremoterelease=2\n' );
                
        setTimeout( function() { //Done capturing
            clearTimeout( watcher );
            process.stdin.write( 'q\n' );
            process.stdin.end();
        }, 1000 );
        
    }, waitTime - ts.now() + timeEnter - 90 ); //Shorten 100ms for better sync with the pi-cam
}

function takeImage_DSLR() {
    var args = [
        "--set-config", "datetime=now",
        "--set-config", "artist=Lip",
        "--set-config", "capturetarget=1",
        "--set-config", "focusmode=0",
        "--set-config", "/main/settings/autopoweroff=True",
        "--set-config-value", "/main/imgsettings/iso=400",
        //"--set-config-value", "/main/capturesettings/aperture=5.6",
        "--force-overwrite",
        //"--debug", "--debug-logfile=/home/pi/gphoto2-logfile.txt",
        "--capture-image-and-download",
        "--filename="+getAbsoluteImagePath_DSLR()];
    
    //var imageProcess = spawn('gphoto2', args);
    //imageProcess.stdout.on('data', function(data) {
    //  console.log( "--" + data.toString());
    //});
    // The image should take about 5 seconds, if its going after 10 kill it!
    setTimeout(function(){ 
        //imageProcess.kill();
        }, 10000);

    //imageProcess.on('exit', sendImage_DSLR);
    //imageProcess.on('exit', update_DSLR_Battery_Info);     //Update the battery info
    
    var tmpTest = spawn('node', ['test_continuous_capture.js']);
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

const deleteFolderRecursive = function(folder) {
  if (fs.existsSync(folder)) {
    fs.readdirSync(folder).forEach((file, index) => {
      const curPath = path.join(folder, file);
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folder);
  }
};

// Run the boot sequence
boot();
