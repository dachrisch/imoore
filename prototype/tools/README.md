# Captcha bridge tools

These helpers let the prototype mint a Google reCAPTCHA token from the official
imoo app, because `sendRandCodeV2` requires one (`captchaId` + `validate`).
See [`docs/recaptcha-bridge.md`](../../docs/recaptcha-bridge.md) for why this
cannot be done from Node.

## Phone setup

1. Root the phone (Magisk) and enable USB debugging.
2. Install a `frida-server` build whose **major.minor** matches the host Frida:

   ```sh
   adb push frida-server /data/local/tmp/frida-server
   adb shell su -c 'chmod 755 /data/local/tmp/frida-server'
   adb shell su -c 'nohup /data/local/tmp/frida-server >/dev/null 2>&1 &'
   frida-ps -U            # must list the device/processes
   ```

3. Install the host tooling: `pip install frida frida-tools` (the Python helper
   uses `frida_tools`' Java bridge file).

## Usage

The prototype calls these automatically; to test by hand:

```sh
PID=$(adb shell pidof com.imoo.watch.global | tr -d '\r')
python3 fetch-captcha.py "$PID" fetch-captcha.js
# prints CAPTCHA_TOKEN=...
```

Then send with the prototype:

```sh
IMOORE_CAPTCHA_BRIDGE=1 PORT=3123 node ../server.js
```

## Notes

- The app must be foregrounded; the bridge runs `monkey` first.
- Tokens are single-use and short-lived; fetch one per send.
- The Frida script finds any live imoo `Activity` (login, register,
  change-phone, main) and calls the app's own `randcodevalideate.Gabon`.
- If Frida reports `Java is not defined`, the Python helper is not loading
  `frida_tools/bridges/java.js` (see `fetch-captcha.py`).
