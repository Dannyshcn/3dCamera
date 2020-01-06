import subprocess, signal, os, sys
import datetime
import time

cmd_gphoto2 = "gphoto2"
arg_capture = "--capture-image-and-download"
arg_output_image = sys.argv[1]
arg_download = "--filename=" + arg_output_image #"--get-all-files"
arg_clear	 = "--delete-all-files"
arg_recur	 = "-R"
arg_folder	 = "--folder=/store_00020001/DCIM/104CANON"

def killGphoto2Process():
    p = subprocess.Popen(['ps', 'aux'], stdout=subprocess.PIPE)
    out, err = p.communicate()

    # Search for the process we want to kill
    for line in out.splitlines():
        if b'gvfsd-gphoto2' in line:
            # Kill that process!
            pid = int(line.split(None,2)[1])
            os.kill(pid, signal.SIGKILL)

time.sleep(2.0)

#Remove the image
subprocess.call(["rm", arg_output_image])
#Kill the process
killGphoto2Process()
#Set config
subprocess.call(["gphoto2",
 "--set-config", "datetime=now",
 "--set-config", "artist=Lip",
 "--set-config", "capturetarget=1",
 "--set-config", "focusmode=0"])

#print(str(datetime.datetime.utcnow()))

#subprocess.call(["gphoto2", "--auto-detect"])

#subprocess.call([cmd_gphoto2, arg_folder, arg_clear, arg_recur])
subprocess.call([cmd_gphoto2, arg_capture, arg_download])
#subprocess.call(["gphoto2", "--list-files"])
