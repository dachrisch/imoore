/*
 * dump_crypto.js — Frida script to extract the imoo Watch request signing + body
 * encryption at runtime. Reverse-engineered targets from base.apk (see
 * docs/auth-protocol.md). Requires a ROOTED device with frida-server, and
 * frida-tools on the host.
 *
 * Run (spawn, so early classes get hooked):
 *   frida -U -f com.imoo.watch.global -l dump_crypto.js
 * then perform a login (request SMS code) in the app. Everything is printed
 * with the [imoore] tag.
 *
 * What this captures:
 *   - the per-appId secret: com.xtc.secret.Georgia.Ukraine/Uganda/Venezuela/...
 *   - the MD5 preimage (path + "k=v##…" + secret) via MessageDigest + Uruguay.Hawaii
 *   - the AES/RSA Cipher transforms, keys (incl. the random aesKey) and plaintext
 *     bodies via javax.crypto.Cipher + com.xtc.secret.Georgia.Gabon/Germany/Georgia
 *   - the server RSA public key (passed into Georgia.Georgia(aesKey, pubKey))
 *   - the sign builder args/return (com.bbk.secureunisignon.common.request.Gabon)
 */

function bytesToHex(arr) {
  if (!arr) return "null";
  if (typeof arr === "string") return JSON.stringify(arr);
  var s = "";
  for (var i = 0; i < arr.length; i++) {
    var b = arr[i] & 0xff;
    s += ("0" + b.toString(16)).slice(-2);
  }
  return s;
}

function log() {
  var a = Array.prototype.slice.call(arguments);
  console.log("[imoore]", a.join(" "));
}

// Hook `className` once it is loaded (classes load lazily after spawn).
function hookWhenReady(className, fn) {
  function tryNow() {
    Java.perform(function () {
      if (Java.isClassLoaded(className)) {
        try { fn(); } catch (e) { log("hook error", className, e); }
      } else {
        setTimeout(tryNow, 400);
      }
    });
  }
  tryNow();
}

// Hook every declared method whose parameter type names match `paramSigs`
// (use "java.lang.String", "java.util.Map", "[B" for byte[]). Empty retSig = any.
function hookBySig(className, paramSigs, retSig, cb) {
  hookWhenReady(className, function () {
    var k = Java.use(className);
    var methods;
    try { methods = k.class.getDeclaredMethods(); } catch (e) { return; }
    for (var i = 0; i < methods.length; i++) {
      var m = methods[i];
      var ps = m.getParameterTypes();
      if (ps.length !== paramSigs.length) continue;
      var ok = true;
      for (var j = 0; j < ps.length; j++) {
        if (ps[j].getName() !== paramSigs[j]) { ok = false; break; }
      }
      if (!ok) continue;
      if (retSig && m.getReturnType().getName() !== retSig) continue;
      var name = m.getName();
      try {
        var orig = k[name];
        orig.implementation = function () {
          var args = Array.prototype.slice.call(arguments);
          var ret = orig.call(this, args);
          try { cb(name, args, ret); } catch (e) { log("cb err", e); }
          return ret;
        };
        log("hooked", className + "." + name, "(" + paramSigs.join(",") + ")");
      } catch (e) { /* overload already handled or not present */ }
    }
  });
}

Java.perform(function () {
  log("=== imoo crypto dumper attached ===");

  // 1) MD5 — reveals the full preMd5 string (path + "k=v##…" + secret)
  hookWhenReady("java.security.MessageDigest", function () {
    var MD = Java.use("java.security.MessageDigest");
    MD.digest.overload("[B").implementation = function (data) {
      var ret = this.digest(data);
      log("MD5.digest in=", bytesToHex(data), "out=", bytesToHex(ret));
      return ret;
    };
  });

  // 2) Cipher — reveals AES/RSA transform, key bytes, IV, plaintext
  hookWhenReady("javax.crypto.Cipher", function () {
    var C = Java.use("javax.crypto.Cipher");
    C.getInstance.overload("java.lang.String").implementation = function (t) {
      log("Cipher.getInstance transform=", t);
      return this.getInstance(t);
    };
    C.init.overload("int", "java.security.Key").implementation = function (op, key) {
      log("Cipher.init op=", op, "algo=", key.getAlgorithm(), "key=", bytesToHex(key.getEncoded()));
      return this.init(op, key);
    };
    C.init.overload("int", "java.security.Key", "java.security.spec.AlgorithmParameterSpec").implementation = function (op, key, iv) {
      var ivHex = "none";
      if (iv && iv.getClass().getName() === "javax.crypto.spec.IvParameterSpec") ivHex = bytesToHex(iv.getIV());
      log("Cipher.init op=", op, "algo=", key.getAlgorithm(), "key=", bytesToHex(key.getEncoded()), "iv=", ivHex);
      return this.init(op, key, iv);
    };
    C.doFinal.overload("[B").implementation = function (inp) {
      var ret = this.doFinal(inp);
      log("Cipher.doFinal op in=", bytesToHex(inp), "out=", bytesToHex(ret));
      return ret;
    };
  });

  // 3) The per-appId secrets (real method names observed in the APK)
  ["Ukraine", "Uganda", "Venezuela", "Greece", "Guinea"].forEach(function (mn) {
    hookBySig("com.xtc.secret.Georgia", [], "java.lang.String", function (name, args, ret) {
      log("SECRET Georgia." + name + "() =", ret);
    });
    // also try obfuscated name variants by signature (no args -> String)
  });

  // 4) AES/RSA primitives: (plaintext/aesKey) and (aesKey/pubKey)
  //    Gabon = AES encrypt(body, aesKey); Germany = AES decrypt(resp, aesKey);
  //    Georgia = RSA encrypt(aesKey, serverPubKey)
  hookBySig("com.xtc.secret.Georgia", ["java.lang.String", "java.lang.String"], "java.lang.String",
    function (name, args, ret) {
      log("CRYPT Georgia." + name + "(a=", args[0], " b=", args[1], ") =>", ret);
    });

  // 5) Obfuscated runtime decryptor used for the secrets + AES — match by sig
  hookBySig("com.xtc.secret.XTCgetUtilWrapper", ["java.lang.String", "java.lang.String"], "java.lang.String",
    function (name, args, ret) { log("XTC." + name + "(a=", args[0], " b=", args[1], ") =>", ret); });
  hookBySig("com.xtc.secret.XTCgetUtilWrapper", ["[B", "java.lang.String"], "java.lang.String",
    function (name, args, ret) { log("XTC." + name + "(bytes=", bytesToHex(args[0]), " key=", args[1], ") =>", ret); });

  // 6) MD5 wrapper used by the sign builder
  hookBySig("com.xtc.watch.util.Uruguay", ["java.lang.String"], "java.lang.String",
    function (name, args, ret) { log("Uruguay." + name + "(in=", args[0], ") =>", ret); });

  // 7) The sign builder: Gabon method (String url, Map params) -> String sign
  hookBySig("com.bbk.secureunisignon.common.request.Gabon",
    ["java.lang.String", "java.util.Map"], "java.lang.String",
    function (name, args, ret) {
      log("SIGNBUILDER " + name + " url=", args[0], "params=", (args[1] ? args[1].toString() : "null"), "=>", ret);
    });

  // heartbeat so we know the agent is alive even before any crypto runs
  setInterval(function () { log("heartbeat: still attached"); }, 3000);
});
