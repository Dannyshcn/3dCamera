from gpiozero import LED
from argparse import ArgumentParser

parser = ArgumentParser()
parser.add_argument("-s", dest="state", help="State of the LED(on/off). Default: off", default="off")

args = parser.parse_args()

led = LED(14)       //The GPIO port 14

if "on" == args.state :
  led.on()
else if "off" == args.state :
  led.off()
else
  print("Invalid input: " + args.state)
