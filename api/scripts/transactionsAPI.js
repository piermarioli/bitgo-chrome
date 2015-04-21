angular.module('BitGo.API.TransactionsAPI', [])

.factory('TransactionsAPI', ['$q', '$location', '$resource', '$rootScope', 'UtilityService', 'WalletsAPI', 'KeychainsAPI', 'BG_DEV',
  function($q, $location, $resource, $rootScope, UtilityService, WalletsAPI, KeychainsAPI, BG_DEV) {
    var kApiServer = UtilityService.API.apiServer;
    var PromiseSuccessHelper = UtilityService.API.promiseSuccessHelper;
    var PromiseErrorHelper = UtilityService.API.promiseErrorHelper;

    /**
      * List all historical txs for a wallet
      * @param {object} wallet object
      * @param {object} params for the tx query
      * @returns {array} promise with array of wallettx items
      */
    function list(wallet, params) {
      if (!wallet || !params) {
        throw new Error('Invalid params');
      }
      var resource = $resource(kApiServer + '/wallet/:walletId/wallettx', {
        walletId: wallet.data.id,
        skip: params.skip || 0
      });
      return resource.get({}).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
      * Get the tx history for a single wallettx item
      * @param {string} wallettx id
      * @returns {object} promise with the updated wallettx obj
      */
    function getTxHistory(walletTxId) {
      if (!walletTxId) {
        throw new Error('Invalid params');
      }
      var resource = $resource(kApiServer + '/wallettx/' + walletTxId, {});
      return resource.get({}).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    /**
      * Update a commment on a wallettx item
      * @param {string} wallet id
      * @param {string} wallettx id
      * @param {string} new comment for the transaction
      * @returns {object} promise with the updated wallettx obj
      */
    function updateComment(walletId, walletTxId, comment) {
      if (!walletId || !walletTxId || typeof(comment) === 'undefined') {
        throw new Error('Invalid params');
      }
      var resource = $resource(kApiServer + '/wallettx/:walletTxId/comment', {
        walletId: walletId,
        walletTxId: walletTxId
      });
      return resource.save({ comment: comment }).$promise
      .then(
        PromiseSuccessHelper(),
        PromiseErrorHelper()
      );
    }

    // Send a transaction to the BitGo servers
    function post(transaction) {
      var resource = $resource(kApiServer + "/tx/send", {});
      return new resource(transaction).$save({});
    }

    // Get the list of unspents for a wallet
    function getUTXO(bitcoinAddress, target) {
      var resource = $resource(kApiServer + '/wallet/' + bitcoinAddress + '/unspents', { target: target });
      return new resource.get({}).$promise;
    }

    /**
      * TransactionBuilder
      * The TransactionBuilder is a heavy-lifting bitcoin workhorse for creating, signing, and sending
      * bitcoin transactions from one wallet to either another wallet or an email address.
      * Example usage:
      *       sender = {
      *         wallet: Wallet,    // A client wallet object
      *       };
      *       recipient = {
      *         type: String,
      *         wallet: Wallet,    // A bitcoin address (string) or email address
      *        satoshis: Number,
      *        message: String
      *      };
      *      feeSatoshis = 0.0001 * 1e8;
      *      var tb = new TransactionAPI.TransactionBuilder(sender, recipient, feeSatoshis);
      *      tb.signAndSendTransaction(passcode, otp);
      */
    var TransactionBuilder = function(sender, recipient, feeSatoshis) {
      var self = this;
      this.sender = sender;
      this.recipient = recipient;
      this.feeSatoshis = feeSatoshis;

      var _changeAddress;
      var _credentials = {};
      var _inputs;
      var _outputs;
      var _message = sender.message ? sender.message : "";
      var _transaction;
      var _unspents;

      // Returns the hex-serialized transaction from what has been built so far.
      this.tx = function() {
        if (!_transaction) {
          _transaction = new Bitcoin.Transaction();
        }
        var bytes = _transaction.serialize();
        return Crypto.util.bytesToHex(bytes);
      };

      //
      // Private Methods
      //

      // Decrypt a signing key.
      // Returns {
      //    key:       // the decrypted key, null on failure
      //    error:     // optional string error that occurred
      // }
      var decryptSigningKey = function(account, passcode) {
        var findChainRoot = function(account) {
          if (account.chain && account.chain.parent) {
            var result = findChainRoot(account.chain.parent);
            if (result.key) {
              var chainCode = Bitcoin.Util.hexToBytes(account.chain.code);
              var eckey = Bitcoin.ECKey.createECKeyFromChain(result.key, chainCode);
              result.key = eckey.getWalletImportFormat();
            }
            return result;
          }
          // At the root, decrypt the priv key here.
          try {
            var privKey = UtilityService.Crypto.sjclDecrypt(passcode, account.private.userPrivKey);
            return { key: privKey };
          } catch (e) {
            return { error: 'Invalid password: ' + e, key: null };
          }
        };
        return findChainRoot(account);
      };

      // Decrypt a keychain private key
      var decryptKeychain = function(keychain, passcode) {
        try {
          var privKey = UtilityService.Crypto.sjclDecrypt(passcode, keychain.encryptedXprv);
          return { key: privKey };
        } catch (e) {
          return { error: 'Invalid password: ' + e, key: null };
        }
      };

      // Get the credentials required to send a transaction from fromWallet.
      // Returns a promise.
      var deferred;
      var _getCredentials = function() {
        if (!self.sender ||
            typeof(self.sender.wallet.data) !== 'object' ||
            typeof(self.sender.otp) !== 'string' ||
            typeof(self.sender.passcode) !== 'string') {
          throw Error('invalid argument');
        }
        var errorData = {
          status: 401,
          data: { needsPasscode: true, key: null }
        };
        var params;
        if (self.sender.wallet.data.type === 'external' || self.sender.wallet.data.type === 'safe') {
          if (self.sender.wallet.data.private && self.sender.wallet.data.private.userPrivKey) {
            // check if we have the passcode
            if (!self.sender.passcode) {
              errorData.message = "Missing password";
              return $q.reject(UtilityService.ErrorHelper(errorData));
            }
            // we already have the key!
            var result = decryptSigningKey(self.sender.wallet.data, self.sender.passcode);
            if (result.error) {
              errorData.message = result.error;
              return $q.reject(UtilityService.ErrorHelper(errorData));
            } else {
              _credentials.key = result.key;
            }
            return $q.when(self);
          }
          params = {
            bitcoinAddress: self.sender.wallet.data.id,
            gpk: true
          };
          return WalletsAPI.getWallet(params, false)
          .then(
            function(wallet) {
              // check if we have the passcode
              if (!self.sender.passcode) {
                errorData.message = "Missing password";
                return $q.reject(UtilityService.ErrorHelper(errorData));
              }
              var result = decryptSigningKey(wallet.data, self.sender.passcode);
              if (result.error) {
                errorData.message = result.error;
                throw UtilityService.ErrorHelper(errorData);
              } else {
                _credentials.key = result.key;
                return self;
              }
            },
            function(error) {
              return error;
            }
          );
        } else if (self.sender.wallet.data.type === 'safehd') {
          params = {
            bitcoinAddress: self.sender.wallet.data.id
          };
          var wallet;
          return WalletsAPI.getWallet(params, false)
          .then(function(returnedWallet) {
            wallet = returnedWallet;
            return KeychainsAPI.get(wallet.data.private.keychains[0].xpub, self.sender.otp);
          })
          .then(function(keychain) {
            _credentials.keychainPath = keychain.path;
            _credentials.path = keychain.path + wallet.data.private.keychains[0].path;
            // check if we have the passcode
            if (!self.sender.passcode) {
              errorData.message = "Missing password";
              return $q.reject(UtilityService.ErrorHelper(errorData));
            }
            // check if encrypted xprv is present. It is not present for cold wallets
            if (!keychain.encryptedXprv) {
              return $q.reject({
                error: 'Cannot transact. No user key is present on this wallet.',
                status: 401
              });
            }
            var result = decryptKeychain(keychain, self.sender.passcode);
            if (result.error) {
              errorData.message = result.error;
              throw UtilityService.ErrorHelper(errorData);
            } else {
              _credentials.key = result.key;
              return self;
            }
          });
        } else {
          return $q.reject('can\'t send from this wallet');
        }
      };

      // Compute the wallet we'll send to for this transaction, whether it is an email
      // wallet or a bitcoin address.
      // Returns a promise.
      var _getReceiverWallet = function() {
        if (!self || !self.recipient) {
          throw Error('invalid argument');
        }

        switch(self.recipient.type) {
          case 'bitcoin':
            // Nothing to do, wallet already provided.
            return $q.when(self);
          default:
            throw new Error('unknown receiver type');
        }
      };

      // Prepare a simple transaction from one account to another with fees.
      // Will fetch the unspents, process them, and return an unsigned transaction given the parameters requested.
      // Returns a promise.
      var _prepareTransaction = function() {
        var deferred = $q.defer();
        if (!self.sender ||
            !self.recipient ||
            typeof(self.recipient.address) !== 'string' ||
            typeof(self.recipient.satoshis) !== 'number' ||
            typeof(self.feeSatoshis) !== 'number') {
          throw Error('invalid argument');
        }

        if (self.feeSatoshis > 1e8 || self.feeSatoshis > 1e8) {
          return deferred.reject('fee too large');  // Protection against bad inputs
        }

        // Convert any possible floats to integers.
        self.feeSatoshis = parseInt(self.feeSatoshis, 10);
        self.recipient.satoshis = parseInt(self.recipient.satoshis, 10);

        var totalSpendSatoshis = self.feeSatoshis + self.recipient.satoshis;
        console.log("Sending " + totalSpendSatoshis);

        // Fetch unspents wrapped in a promise.
        var getUnspents = function() {
          return getUTXO(self.sender.wallet.data.id, totalSpendSatoshis)
          .then(
            function(result) {
              _unspents = result.unspents;
              return self;
            },
            function(error) {
              return error;
            }
          );
        };

        // Collect inputs for createTransaction wrapped in a promise.
        var collectInputs = function() {
          var inputs = [];
          var inputAmountSatoshis = 0;
          _unspents.every(function(unspent) {
            inputs.push(unspent);
            inputAmountSatoshis += unspent.value;
            return (inputAmountSatoshis < totalSpendSatoshis);   // Drops out of the loop when false, which stops adding inputs.
          });
          if (totalSpendSatoshis > inputAmountSatoshis) {
            return $q.reject('Insufficient funds');
          }
          _inputs = { inputAmountSatoshis: inputAmountSatoshis, inputs: inputs };
          return $q.when(self);
        };

        // Get a change address wrapped in a promise
        var getChangeAddress = function() {
          if (self.sender.wallet.data.type !== 'safehd') {
            _changeAddress = self.sender.wallet.data.id;
            return $q.when(self);
          }
          return WalletsAPI.createChangeAddress(self.sender.wallet.data.id)
          .then(
            function(newAddress) {
              _changeAddress = newAddress.address;
              return self;
            },
            function(error) {
              return error;
            }
          );
        };

        // Collect outputs for createTransaction wrapped in a promise.
        var collectOutputs = function() {
          _outputs = [ {
            address: self.recipient.address,
            value: self.recipient.satoshis
          } ];
          var remainder = _inputs.inputAmountSatoshis - totalSpendSatoshis;
          // As long as the remainder is greater than dust we send it to our change
          // wallet.  Otherwise, let it go to the miners.
          if (remainder > BG_DEV.TX.MINIMUM_BTC_DUST) {
            _outputs.push({
              address: _changeAddress,
              value: remainder
            });
          }
          return $q.when(self);
        };

        // Returns an unsigned bitcoin trasaction accommodating a set of inputs and outputs.
        // Returns {
        //    transaction:  // the transaction, null on failure
        //    error:        // optional string error that occurred
        // }
        var createTransaction = function() {
          try {
            // The Bitcoin.Transaction library uses exceptions for errors.
            var transaction = new Bitcoin.Transaction();
            _inputs.inputs.forEach(function(unspent) {
              var input = new Bitcoin.TransactionIn(
                {
                  outpoint: { hash: unspent.tx_hash, index: unspent.tx_output_n },
                  script: new Bitcoin.Script(unspent.script),
                  sequence: 4294967295
                }
              );
              transaction.addInput(input);
            });
            _outputs.forEach(function(output) {
              var address = new Bitcoin.Address(output.address);
              var value = output.value;
              transaction.addOutput(address, value);
            });

            return { transaction: transaction };
          }
          catch (e) {
            return { error: 'Error while creating transaction: ' + e, transaction: null };
          }
        };

        // Open the transaction with the computed inputs and outputs.
        var openTransaction = function() {
          var txResult = createTransaction();
          if (txResult.error) {
            return deferred.reject(txResult.error);
          }
          _transaction = txResult.transaction;
          return deferred.resolve(self);
        };

        getUnspents()
          .then(collectInputs)
          .then(getChangeAddress)
          .then(collectOutputs)
          .then(openTransaction)
          .catch(function(error) {
            deferred.reject(error);
          });

        return deferred.promise;
      };

      // Sign a transaction from either P2SH or PubKey wallets.
      // Returns a promise.
      var _signTransaction = function() {
        var wallet = self.sender.wallet.data;
        if (wallet.type === 'safe') {
          var key = new Bitcoin.ECKey(_credentials.key);
          for (var index = 0; index < _transaction.ins.length; ++index) {
            var redeemScript = new Bitcoin.Script(_unspents[index].redeemScript);
            if (!_transaction.signMultiSigWithKey(index, key, redeemScript)) {
              return $q.reject('Failed to sign input #' + index);
            }
            _transaction.verifyInputSignatures(index, redeemScript);
          }
        } else if (wallet.type === 'safehd') {
          var rootExtKey = UtilityService.BitcoinJSLibAugment.BIP32.createFromXprv(_credentials.key);
          for (var index2 = 0; index2 < _transaction.ins.length; ++index2) {
            var path = _credentials.path + _unspents[index2].chainPath;
            var extKey = rootExtKey.derive(path);
            var redeemScript2 = new Bitcoin.Script(_unspents[index2].redeemScript);
            if (!_transaction.signMultiSigWithKey(index2, extKey.eckey, redeemScript2)) {
              return $q.reject('Failed to sign input #' + index2);
            }
            _transaction.verifyInputSignatures(index2, redeemScript2);
          }
        } else if (wallet.type === 'external') {
          var eckey = new Bitcoin.ECKey(_credentials.key);
          _transaction.signWithKey(eckey);
        } else {
          return $q.reject('Unknown account type');
        }
        return $q.when(self);
      };

      // Serializes a signed transaction and posts it for sending.
      // Returns a promise.
      var _sendTransaction = function(transaction) {
        var hexTransaction = self.tx();
        // add the id of the transaction being sent to the object being returned
        var txId = Bitcoin.Util.bytesToHex(_transaction.getHashBytes().reverse());
        console.log('Sending Transaction: ' + txId);
        console.log(hexTransaction);
        return post({ message: _message, tx: hexTransaction })
        .then(function(result) {
          if (result.error) {
            self.pendingApproval = result; // self.pendingApproval won't exist unless the TX violates a limit
          }
          self.transactionId = result.transactionHash;
          return result;
        });
      };

      // After sending, notifies email recipients of their bitcoin custodial account.
      // Returns a promise.
      var _notifyDelivery = function() {
        // If this is not a custodial account, we have no work to do.
        if (!self.recipient.custodialAccount) {
          return $q.when(self);
        }

        throw new Error('email based delivery removed');
      };

      //
      // Public Methods
      //

      // Sign a transaction, if you already have the key.
      // Returns a promise.
      this.signWithKey = function(key, path) {
        _credentials = {
          key: key,
          path: path ? path : 'm'
        };
        return _getReceiverWallet()
          .then(_prepareTransaction)
          .then(_signTransaction);
      };

      // Fetch a user's key from storage, decrypt it, and then create and sign a transaction.
      // Returns a promise.
      this.signTransaction = function(passcode, otp) {
        self.sender.passcode = passcode;
        self.sender.otp = otp || '';
        return _getCredentials()
          .then(_getReceiverWallet)
          .then(_prepareTransaction)
          .then(_signTransaction);
      };

      // Send a Transaction.
      // Returns a promise.
      this.sendTransaction = function(passcode, otp) {
        return _sendTransaction()
          .then(_notifyDelivery);
      };

      // Sign and Send a Transaction.
      // Returns a promise.
      this.signAndSendTransaction = function(passcode, otp) {
        return self.signTransaction(passcode, otp)
          .then(self.sendTransaction);
      };
    };

    /**
    * Given an existing transaction, clone the outputs with current
    * unspents and return a TransactionBuilder for a new transaction.
    * Note:  this is only intended to work with a bitgo style transaction -
    * where the first output is the value being sent.
    *
    * @param {obj} sender - tx sender information
    * @param {obj} tx - deserialized bitcoin transaction object
    * @returns {obj} new instance of TransactionBuilder object
    * @public
    * @example
    *   sender = {
    *     wallet: Wallet // a wallet object
    *   };
    *   var tb = new TransactionAPI.clone(sender, tx);
    *   tb.signAndSendTransaction(passcode, otp);
    */
    function clone(sender, tx) {
      var oldOutput = tx.outs[0];
      var outputAddresses = [];
      oldOutput.script.extractAddresses(outputAddresses);
      var recipient = {
        type: 'bitcoin',
        address: outputAddresses[0].toString(),
        satoshis: oldOutput.value
      };
      var feeSatoshis = 0.0001 * 1e8;  // Probably shouldn't hard code this.
      return new TransactionBuilder(sender, recipient, feeSatoshis);
    }

    // In-client API
    return {
      TransactionBuilder: TransactionBuilder,
      getTxHistory: getTxHistory,
      updateComment: updateComment,
      clone: clone,
      list: list
    };
  }
]);
