// Fetch one Google reCAPTCHA token from the running imoo app and write it to
// /sdcard/imoo_captcha.txt. The app's own SDK is used because the token is
// bound to the app package/site key (com.recaptcha.id.app.imoo).
//
// Run: frida -U -p <pid> -l fetch-captcha.js -q
// Requires: rooted phone, frida-server, app running with an Activity.

function writeFile(path, text) {
  var FileOutputStream = Java.use("java.io.FileOutputStream");
  var JString = Java.use("java.lang.String");
  var fos = FileOutputStream.$new(path);
  try {
    fos.write(JString.$new(text).getBytes("UTF-8"));
    fos.flush();
  } finally {
    fos.close();
  }
}

Java.perform(function () {
  var act = null;
  var candidates = [
    "com.xtc.changephone.SetVerificationCodeActivity",
    "com.xtc.changephone.AuthenticationActivity",
    "com.xtc.changephone.ConfirmOldPhoneActivity",
    "com.xtc.account.activity.LoginActivity",
    "com.xtc.account.activity.thirdlogin.ThirdLoginActivity",
    "com.xtc.watch.MainActivity",
  ];
  candidates.forEach(function (name) {
    if (act !== null) return;
    try {
      Java.choose(name, {
        onMatch: function (a) {
          if (act === null && a !== null && !a.isFinishing()) act = a;
        },
        onComplete: function () {},
      });
    } catch (e) {}
  });

  // Fallback: any live Activity belonging to this app (covers screens that are
  // not in the list above, e.g. ConfirmOldPhoneActivity).
  if (act === null) {
    try {
      Java.choose("android.app.Activity", {
        onMatch: function (a) {
          try {
            if (act === null && a !== null && !a.isFinishing() &&
                a.getPackageName() === "com.imoo.watch.global") {
              act = a;
            }
          } catch (e) {}
        },
        onComplete: function () {},
      });
    } catch (e) {}
  }

  if (act === null) {
    console.log("CAPTCHA_NO_ACTIVITY");
    send({ type: "error", error: "no activity" });
    return;
  }
  console.log("CAPTCHA_ACTIVITY=" + act.getClass().getName());

  var RcGabon = Java.use("com.xtc.account.randcodevalideate.Gabon");
  var RcIface = Java.use("com.xtc.account.randcodevalideate.Gabon$Hawaii");
  var cbName = "com.rea.CapCb" + Date.now();

  var Cb = Java.registerClass({
    name: cbName,
    implements: [RcIface],
    methods: {
      onSuccess: function (token) {
        send({ type: "token", token: String(token) });
        try {
          var dir = act.getFilesDir().getAbsolutePath();
          var path = dir + "/imoo_captcha.txt";
          writeFile(path, String(token));
          console.log("CAPTCHA_TOKEN=" + token);
        } catch (e) {
          console.log("CAPTCHA_WRITE_ERROR=" + e);
        }
      },
      onClose: function () {
        console.log("CAPTCHA_CLOSED");
        send({ type: "error", error: "recaptcha closed" });
      },
      Georgia: function () {},
    },
  });

  Java.scheduleOnMainThread(function () {
    try {
      RcGabon.Gabon(act, Cb.$new());
    } catch (e) {
      console.log("CAPTCHA_ERROR=" + e);
      send({ type: "error", error: String(e) });
    }
  });
});
