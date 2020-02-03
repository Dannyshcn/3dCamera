import time, datetime
import picamera
import sys
from fractions import Fraction
receivedTime = datetime.datetime.now()
calledTime = datetime.datetime.fromtimestamp( float(sys.argv[1]) * 0.001 )
deltaTime = (receivedTime - calledTime).total_seconds()
#print( "Delta time: " + str(deltaTime))
#print( targetRunTime )
waitTime = float( sys.argv[2] ) * 0.001
folder = sys.argv[3];
with picamera.PiCamera(resolution=(1640, 1232), framerate=40) as camera:
  camera.shutter_speed = 25000
  #camera.iso = 200
  camera.awb_mode = 'off'
  camera.exposure_mode = 'sports'
  camera.awb_gains = [Fraction(173,128), Fraction(591, 256)]
  camera.start_preview()
  files = [folder + "/image" + str(i) + ".jpg" for i in range(10)]
  waitTime = waitTime - deltaTime - (datetime.datetime.now() - receivedTime).total_seconds()
  #print( "Wait for: " + str( waitTime ))
  time.sleep( waitTime + 0.1 )
  #camera.shutter_speed = camera.exposure_speed
  camera.exposure_mode = 'off'
  #g = camera.awb_gains
  #camera.awb_mode = 'off'
  #camera.awb_gains = g
  camera.capture_sequence(files, use_video_port=True)
  camera.stop_preview()
#print( camera.analog_gain )
#print( camera.digital_gain )
#print( camera.exposure_speed )
