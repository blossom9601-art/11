#!/bin/bash
python3 -c "
import ssl
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
print('verify_mode:', ctx.verify_mode)
print('check_hostname:', ctx.check_hostname)
"
