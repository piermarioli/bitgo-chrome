/**
 * @ngdoc service
 * @name SDK
 * @description
 * Manages authenticating with and caching the sdk object of the SDK, so that
 * the SDK can be used throughout the client.
 */
angular.module('BitGo.API.SDK', ['ngResource'])

.factory('SDK', ['CacheService',
  function(CacheService) {
    var sdkCache = new CacheService.Cache('sessionStorage', 'SDK');

    // the environment variable, normally set to "prod", "staging", "test",
    // "webdev" or "local"
    var env;

    // if a URL other than one of the standard ones (www.bitgo.com, etc.) is
    // detected, this gets set to that URL
    var customRootURI;

    // the network (bitcoin or test) if we aren't using one of the standard
    // environments
    var customBitcoinNetwork;

    // strip optional "." from the end of the hostname, if present (this almost
    // never occurs in practice, but technically a hostname can end in a
    // period).
    var hostname = location.hostname;
    if (hostname[hostname.length - 1] === ".") {
      hostname = hostname.substr(0, hostname.length - 1);
    }

    // Handle the case of the chrome app first
    if (location.protocol === "chrome-extension:") {
      env = BitGoConfig.env.isProd() ? 'prod' : 'test';
    } else {
      // determine what environment to use
      switch(hostname) {
        case "www.bitgo.com":
          env = "prod";
          break;
        case "staging.bitgo.com":
          env = "staging";
          break;
        case "test.bitgo.com":
          env = "test";
          break;
        case "webdev.bitgo.com":
          env = "dev";
          break;
        case "localhost":
          env = "local";
          break;
        default:
          customRootURI = "https://" + location.host;
          customBitcoinNetwork = BitGoConfig.env.isProd() ? "bitcoin" : "test";
      }
    }

    // parameters for constructing SDK object
    var params = {
      env: env,
      customRootURI: customRootURI,
      customBitcoinNetwork: customBitcoinNetwork,
      validate: false // for the benefit of slower devices, don't perform redundant validation
    };

    var sdk;

    return {
      /**
      * Returns the current instance of the SDK. If not already loaded, it
      * loads the SDK.
      *
      * @returns {Object} an instance of the SDK
      */
      get: function() {
        if (sdk) {
          return sdk;
        }
        return this.load();
      },

      /**
      * Loads an instance of the SDK from cache and returns it. If the SDK is
      * not found in the cache, a new instance is created and returned.
      *
      * @returns {Object} an instance of the SDK
      */
      load: function() {
        var json = sdkCache.get('sdk');
        sdk = new BitGoJS.BitGo(params);
        if (json) {
          try {
            sdk.fromJSON(json);
          } catch (e) {
            // if there was an error loading the SDK JSON data, we'll make a
            // new one. If such an error ever occurs, it may mean a logged-in
            // user is no longer logged in.
            sdk = new BitGoJS.BitGo(params);
          }
        }
        return sdk;
      },

      /**
      * Saves the current instance of the SDK to cache. This should be called
      * everytime you wish to cache the SDK, for instance after logging in, if
      * you wish to remember the state of the sdk upon page reload.
      *
      * @returns {undefined}
      */
      save: function() {
        sdkCache.add('sdk', sdk.toJSON());
      },

      /**
      * Deletes the instance of the SDK from cache. This is what you should do
      * when you want to clear the memory of the SDK, for instance if the user
      * is logging out.
      *
      * @returns {undefined}
      */
      delete: function() {
        sdk = undefined;
        sdkCache.remove('sdk');
      }
    };
  }
]);
