angular.module('BitGo.Utility.UtilityService', [])

.factory('UtilityService', ['$q', '$location', '$rootScope', 'BG_DEV',
  function($q, $location, $rootScope, BG_DEV) {
    /**
     * Helper function to convert a utf8 string to a Uint8Array of same length
     *
     * @private
     * @param {String} utf8 string
     * @returns {Array} Returns a new instance of Uint8Array
     */
    function utf8toByteArray(string) {
      var length = string.length;
      return new Uint8Array(length);
    }

    // Conversion Utils
    var Converters = {
      /**
       * Converts a base65 string to a buffer array
       *
       * @public
       * @param {String} base64 string
       * @returns {Array} Returns an array buffer based on the base64 input
       */
      base64ToArrayBuffer: function(base64) {
        // convert base64 string to utf8
        var binaryString =  window.atob(base64);
        // initialize a new byteArray from the decoded base64 string
        var byteArray = utf8toByteArray(binaryString);
        // convert the characters to ascii
        for (var index = 0; index < byteArray.length; index++)        {
          var ascii = binaryString.charCodeAt(index);
          byteArray[index] = ascii;
        }
        return byteArray.buffer;
      },
      // convert BTC value to Satoshi value
      BTCtoSatoshis: function(val) {
        if (typeof(val) == 'undefined') {
          throw new Error('bad argument');
        }
        var valFloat = parseFloat(val);
        return Math.round(valFloat * 1e8);
      }
    };

    // Validation Utils
    var Validators = {
      emailOk: function(email) {
          return (/^[a-zA-Z0-9\-\_\.\+]+@[a-zA-Z0-9\-\_\.]+\.[a-zA-Z0-9\-\_]+$/).test(email);
      },
      emailMatch: function(e1, e2) {
        try {
          e1 = e1.toLowerCase();
          e2 = e2.toLowerCase();
        } catch (e) {
          return false;
        }
        return e1 === e2;
      },
      phoneOk: function(phone) {
        if (!phone) {
          return false;
        }
        if (phone[0] !== '+') {
          phone = '+'.concat(phone);
        }
        return intlTelInputUtils.isValidNumber(phone);
      },
      phoneMatch: function(p1, p2) {
        if (!p1 || !p2) {
          return false;
        }
        return p1 === p2;
      },
      otpOk: function(otp) {
        return (/^\d{7}$/).test(otp);
      },
      currencyOk: function(currency) {
        if (!currency) {
          return false;
        }
        return _.indexOf(BG_DEV.CURRENCY.VALID_CURRENCIES, currency) > -1;
      },
      bitcoinUnitOk: function(unit) {
        if (!unit) {
          return false;
        }
        return _.indexOf(BG_DEV.CURRENCY.VALID_BITCOIN_UNITS, unit) > -1;
      }
    };

    // Formatter Utils
    var Formatters = {
      email: function(email) {
        if (!email) {
          throw new Error('expected an email');
        }
        return email.trim().toLowerCase();
      },
      phone: function(phone) {
        if (!phone) {
          throw new Error('expected a phone');
        }
        if (phone[0] !== '+') {
          phone = '+'.concat(phone);
        }
        return intlTelInputUtils.formatNumberE164(phone);
      }
    };

    // Crypto Utils
    var Crypto = {
      // Create a cryptographically secure password of n_words characters
      generateRandomPassword: function(n_words) {
        n_words = n_words || 7;
        return Bitcoin.Base58.encode(sjcl.random.randomWords(n_words));
      },
      // Note: sjclEncrypt is how we like to use sjcl encryption.  The defaults are okay,
      // but we like to do more stretching.  Because customers think AES256 is better than AES128,
      // we use that too.
      /**
       * Encrypts a message with a password
       *
       * @public
       * @param {String} password string
       * @param {String} message string
       * @returns {string} message encrypted with the password
       */
      sjclEncrypt: function(password, message) {
        var options = { iter: 10000, ks: 256 };
        return sjcl.encrypt(password, message, options);
      },
      /**
       * Decrypts a message with a password
       *
       * @public
       * @param {String} password string
       * @param {String} message string
       * @returns {string} decrypted message
       */
      sjclDecrypt: function(password, message) {
        return sjcl.decrypt(password, message);
      },
      /**
       * Hashes a value to a key
       *
       * @public
       * @param {String} key string
       * @param {Object} any object to hash
       * @returns Hashed value
       */
      sjclHmac: function(key, value) {
        var out =  (new sjcl.misc.hmac(sjcl.codec.utf8String.toBits(key), sjcl.hash.sha256)).mac(value);
        return sjcl.codec.hex.fromBits(out).toLowerCase();
      },
      prng: undefined,
      setPrng: function(prng) {
        if (!prng) {
          throw new Error('no prng initialized');
        }
        // Kick off event watchers which are used to initialize the PRNG
        this.prng = prng;
      },
      /**
       * Creates and ECDH secret. Used for creating and accepting wallet share
       *
       * @public
       * @param {String} priv key of the user
       * @param {String} pub key of the person to share with
       * @returns {String} the ECDH secret
       */
      getECDHSecret: function(privKey, pubKey){
        var otherKey = new Bitcoin.ECKey('0');
        otherKey.setPub(pubKey);
        var secretPoint = otherKey.getPubPoint().multiply(privKey);
        var secret = secretPoint.getX().toBigInteger().toByteArrayUnsigned();
        return Bitcoin.Util.bytesToHex(secret).toLowerCase();
      }
    };

    // Bitcoin Utils
    var BitcoinJSLibAugment = {
      BIP32: {
        // Function to create a BIP32 object from an xprv that might be corrupted with
        // the bad padding bug.
        createFromXprv: function(xprv) {
          var rootExtKey;
          try {
            rootExtKey = new Bitcoin.BIP32(xprv);
          } catch (e) {
            // Check if this is the improperly encoded key problem.
            if (e.message !== 'Not enough data') {
              throw e;
            }
            rootExtKey = new Bitcoin.BIP32().initFromBadXprv(xprv);
          }
          return rootExtKey;
        }
      }
    };

    // Browser Utils
    var Global = {
      isChromeApp: location.protocol === "chrome-extension:",
      browserIsUnsupported: function() {
        if (!bowser) {
          throw new Error('Bowser not detected -- needed to determine supported browsers');
        }
        return bowser.msie && (bowser.version <= 9);
      }
    };

    // Url Utils
    var Url = {
      scrubQueryString: function(param) {
        var urlParams = $location.search();
        var scrubTypes = {
          phone: ['setPhone', 'verifyPhone'],
          email: ['needsEmailVerify']
        };

        if (!param || _.isEmpty(urlParams)) {
          return;
        }
        if (_.has(scrubTypes, param)) {
          _.forEach(scrubTypes[param], function(paramToRemove) {
            $location.search(paramToRemove, null);
          });
        }
      },
      getEnterpriseSectionFromUrl: function() {
        var url = $location.path().split('/');
        // E.g.: /enterprise/:enterpriseId/settings
        var currentSectionIdx = _.indexOf(url, 'enterprise') + 2;
        return url[currentSectionIdx];
      },
      getEnterpriseIdFromUrl: function() {
        var url = $location.path().split('/');
        // E.g.: /enterprise/:enterpriseId
        var curEnterpriseIdx = _.indexOf(url, 'enterprise') + 1;
        return url[curEnterpriseIdx];
      },
      getWalletIdFromUrl: function() {
        var url = $location.path().split('/');
        // E.g.: /enterprise/:enterpriseId/wallets/:walletId
        var curWalletIdx = _.indexOf(url, 'wallets') + 1;
        return url[curWalletIdx];
      },
      isMarketingPage: function() {
        var marketingPage = false;
        BG_DEV.MARKETING_PATHS.forEach(function(testUrl) {
          if (testUrl === $location.path()) {
            marketingPage = true;
            return false; // short circuit the forEach
          }
        });
        return marketingPage;
      }
    };

    // API Utils
    var API = {
      apiServer: undefined,
      getApiServer: function() {
        return this.apiServer;
      },
      // Set the server api route
      setApiServer: function() {
        if (Global.isChromeApp) {
          var server = 'https://test.bitgo.com';  // default to testnet.
          if (typeof(APP_ENV) === 'undefined') {
            console.log("WARNING:  Chrome app env undefined");
          } else if (APP_ENV.bitcoinNetwork != 'testnet') {
            server = 'https://www.bitgo.com';
          }
          this.apiServer = server;
        } else {
          this.apiServer = location.protocol + '//' + location.hostname + (location.port && ':' + location.port);
        }
        this.apiServer += "/api/v1";
      },
      promiseSuccessHelper: function(property) {
        return function(successData) {
          if (property && _.has(successData, property)) {
            return $q.when(successData[property]);
          } else {
            return $q.when(successData);
          }
        };
      },
      promiseErrorHelper: function() {
        return function(error) {
          /**
           * Decide whether or not to show an app offline error
           * @param error {Object}
           * @private
           * @returns {Bool}
           */
          function showOfflineError(error) {
            // Don't show an offline error if on a marketing page
            if (!error || Url.isMarketingPage()) {
              return false;
            }
            // Trigger the error only if the user is logged in and using the app
            if (error.status === 0 && $rootScope.currentUser.loggedIn) {
              return true;
            }
            return false;
          }

          // Handle the case when the user loses browser connection
          if (showOfflineError(error)) {
            $rootScope.$emit('UtilityService.AppIsOffline');
          }

          var formattedError = {
            status: error.status,
            error: (error.data && error.data.error) || 'Oops!  Looks like BitGo servers are experiencing problems.  Try again later.'
          };

          // handle errors generated by SDK
          if (error.message) {
            formattedError.error = error.message;
            if (error.needsOTP) {
              formattedError.needsOTP = true;
            }
          }

          // handle errors generated by $resource
          if (error.data) {
            if (error.data.needsOTP) {
              formattedError.needsOTP = error.data.needsOTP;
            }
            if (error.data.needsEmailVerify) {
              formattedError.needsEmailVerify = error.data.needsEmailVerify;
            }
            if (error.data.needsAuthy) {
              formattedError.needsAuthy = error.data.needsAuthy;
            }
          }
          return $q.reject(formattedError);
        };
      },
      isOtpError: function(error) {
        if (!error) {
          throw new Error('Missing error');
        }
        if (error.data) {
          return (error.status === 401 && error.data.needsOTP);
        }
        return (error.status == 401 && error.needsOTP);
      },
      isPasscodeError: function(error) {
        if (!error) {
          throw new Error('Missing error');
        }
        return (error.status === 401 && error.needsPasscode);
      }
    };

    // Constructs an error object we can throw and handle within the app
    function ErrorHelper(errorData) {
      if (!errorData.status || !errorData.message || !errorData.data) {
        throw new Error('Missing arguments');
      }
      var error = new Error(errorData.message);
      error.error = errorData.message;
      error.status = errorData.status;
      // Attach the properties
      _.forIn(errorData.data, function(value, key) {
        error[key] = value;
      });
      return error;
    }

    function initUtils() {
      // initialize the API route
      API.setApiServer();
    }
    initUtils();

    return {
      API: API,
      BitcoinJSLibAugment: BitcoinJSLibAugment,
      Converters: Converters,
      Crypto: Crypto,
      Formatters: Formatters,
      Global: Global,
      Url: Url,
      Validators: Validators,
      ErrorHelper: ErrorHelper
    };
  }
]);
