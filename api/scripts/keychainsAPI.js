angular.module('BitGo.API.KeychainsAPI', [])
/*
  Notes:
  - This module is for managing all http requests for Keychains
*/
.factory('KeychainsAPI', ['$q', '$location', '$resource', '$rootScope', 'UtilityService', 'UserAPI',
  function($q, $location, $resource, $rootScope, Utils, UserAPI) {
    var kApiServer = Utils.API.apiServer;
    var PromiseSuccessHelper = Utils.API.promiseSuccessHelper;
    var PromiseErrorHelper = Utils.API.promiseErrorHelper;

    // Helper: generates a new BIP32 keychain to use
    function generateKey() {
      // Generate the entropy for the keychain's seed
      var randomBytes = new Array(256);
      new Bitcoin.SecureRandom().nextBytes(randomBytes);
      var seed = Bitcoin.Util.bytesToHex(randomBytes);
      // create a new BIP32 object from the random seed
      return new Bitcoin.BIP32().initFromSeed(seed);
    }

    // Creates keychains on the BitGo server
    function createKeychain(data) {
      // source for the keychain being created (currently 'user' or 'cold')
      var source = data.source;
      // the passcode used to encrypt the xprv
      var passcode = data.passcode;
      // the BIP32 extended key used to create a keychain when a user wants to use their own backup
      var extendedKey = data.extendedKey;
      var saveEncryptedXprv = data.saveEncryptedXprv;

      // If the user doesn't provide a key, generate one
      if (!extendedKey) {
        extendedKey = generateKey();
      }
      // Each saved keychain object has these properties
      var keychainData = {
        source: data.source,
        xpub: extendedKey.extended_public_key_string()
      };
      // If we're storing the encryptedXprv, include this with the request
      if (saveEncryptedXprv) {
        // The encrypted xprv; encrypted with the wallet's passcode
        keychainData.encryptedXprv = Utils.Crypto.sjclEncrypt(passcode, extendedKey.extended_private_key_string());
        // And a code that is used to encrypt the user's wallet passcode (the 'passcode' referenced in this function)
        // This code is only ever used to encrypt the original passcode for this keychain,
        // and is used only for recovery purposes with the original encrypted xprv blob.
        //if we are generating ECDH key for user, passcodencryption code is not needed
        if(source !== 'ecdh'){
          keychainData.originalPasscodeEncryptionCode = data.originalPasscodeEncryptionCode;
        }
      }

      function onCreateSuccess(data) {
        // For backup purposes: We'll decorate the returned keychain object
        // with the xprv and encryptedXprv so we can access them in the app
        if (extendedKey.has_private_key) {
          data.xprv = extendedKey.extended_private_key_string();
          if (!data.encryptedXprv) {
            data.encryptedXprv = Utils.Crypto.sjclEncrypt(passcode, data.xprv);
          }
        }
        return data;
      }
      // Return the promise
      var resource = $resource(kApiServer + '/keychain', {});
      return new resource(keychainData).$save({})
      .then(
        function(data) {
          return onCreateSuccess(data);
        },
        function(error) {
          // 301 means we tried adding a keychain that already exists
          // so we treat this case like a success and return the keychain
          if (error.status === 301) {
            return onCreateSuccess(data);
          }
          return PromiseErrorHelper()(error);
        }
      );
    }

    // Create and return the new BitGo keychain
    function createBitGoKeychain() {
      var resource = $resource(kApiServer + '/keychain/bitgo', {});
      return new resource({}).$save({})
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    // Get a specific BitGo keychain
    function get(xpub) {
      if (typeof(xpub) !== 'string') {
        throw new Error('illegal argument');
      }
      var keychainsResource = $resource(kApiServer + '/keychain/' + xpub, {});
      return new keychainsResource().$save({})
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
     * Update a bitgo keychain
     * @param {Obj} bitgo keychain object to update
     * @returns {Obj} updated bitgo keychain
     */
    function update(keychainData) {
      if (typeof(keychainData.xpub) !== 'string' || typeof(keychainData.encryptedXprv) !== 'string') {
        throw new Error('illegal argument');
      }
      var resource = $resource(kApiServer + '/keychain/' + keychainData.xpub, {}, {
        update: { method: 'PUT' }
      });
      return new resource(keychainData).$update({})
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    // In-client API
    return {
      get: get,
      update: update,
      createKeychain: createKeychain,
      createBitGoKeychain: createBitGoKeychain,
      generateKey: generateKey
    };
  }
]);
