from gpiozero import LED
from argparse import ArgumentParser
import time
import signal
import sys

def readConfiguration(signalNumber, frame):
    #print ('(SIGHUP) reading configuration')
    return

def terminateProcess(signalNumber, frame):
   # print ('(SIGTERM) terminating the process')
    sys.exit()

def receiveSignal(signalNumber, frame):
    print('Received:', signalNumber)

# register the signals to be caught
signal.signal(signal.SIGHUP, readConfiguration)
signal.signal(signal.SIGINT, receiveSignal)
signal.signal(signal.SIGQUIT, receiveSignal)
signal.signal(signal.SIGILL, receiveSignal)
signal.signal(signal.SIGTRAP, receiveSignal)
signal.signal(signal.SIGABRT, receiveSignal)
signal.signal(signal.SIGBUS, receiveSignal)
signal.signal(signal.SIGFPE, receiveSignal)
#signal.signal(signal.SIGKILL, receiveSignal)
signal.signal(signal.SIGUSR1, receiveSignal)
signal.signal(signal.SIGSEGV, receiveSignal)
signal.signal(signal.SIGUSR2, receiveSignal)
signal.signal(signal.SIGPIPE, receiveSignal)
signal.signal(signal.SIGALRM, receiveSignal)
signal.signal(signal.SIGTERM, terminateProcess)

parser = ArgumentParser()
parser.add_argument("-s", dest="state", help="State of the LED(on/off). Default: off", default="off")

args = parser.parse_args()

led = LED(14)		#GPIO 14

#time.sleep(2)

#counter = 0
#while counter < 1 :
#  led.on()
#  time.sleep(13.33e-3)
#  led.off()
#  time.sleep(13.33e-3)
#  counter += 26.67e-3

if "on" == args.state :
  led.on()
elif "off" == args.state :
  led.off()
else:
  print("Invalid input: " + args.state)

# wait in an endless loop for signals 
while True :
  time.sleep(1);
