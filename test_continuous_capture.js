var spawn = require('child_process').spawn;'SIGINT'

var args = [
	//"--set-config-value", "/main/capturesettings/aperture=5.6",
	//"-F", "2", "I", "1",
	"--set-config-index", "/main/capturesettings/drivemode=1",
	"--set-config-index", "/main/actions/eosremoterelease=2",
	//"--set-config-index", "/main/capturesettings/shutterspeed=37",
	
	//"--debug", "--debug-logfile=/home/pi/gphoto2-logfile.txt",
	"--capture-image",
	//"--wait-event-and-download 500ms",
	];

var imageProcess = spawn('gphoto2', args);

imageProcess.on('exit', function(){ 

	args = [
		"--set-config-index", "/main/actions/eosremoterelease=0",
		"--get-all-files","--force-overwrite",
		"--filename=/home/pi/Pictures/%:",
		"--delete-all-files", "-R"
	];
	
	imageProcess = spawn('gphoto2', args);
});


