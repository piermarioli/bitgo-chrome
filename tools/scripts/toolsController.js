/**
 * @ngdoc controller
 * @name ToolsController
 * @description
 * Manages the all functionality for the new key creation tool
 */
angular.module('BitGo.Tools.ToolsController', [])

.controller('ToolsController', ['$scope',
  function($scope) {
    $scope.random = '';
    $scope.creationDate = new Date().toLocaleString();

    // Generates a BIP32 key and populates it into the scope.
    $scope.onGenerateBIP32Key = function() {
      sjcl.random.addEntropy($scope.random, $scope.random.length, 'user');
      var randomBytes = new Array(256);
      new Bitcoin.SecureRandom().nextBytes(randomBytes);
      var seed = Bitcoin.Util.bytesToHex(randomBytes);
      $scope.newKey = new Bitcoin.BIP32().initFromSeed(seed);
      $scope.xpub = $scope.newKey.extended_public_key_string();
      $scope.xprv = $scope.newKey.extended_private_key_string();
      $scope.address = $scope.newKey.eckey.getBitcoinAddress().toString();
    };

    // Compute the address based on the inputs.
    var computeAddress = function() {
      if (!$scope.userKey || !$scope.backupKey || !$scope.bitgoKey) {
        return;
      }

      var pubKeys = [];
      pubKeys.push($scope.userKey.eckey.getPub());
      pubKeys.push($scope.backupKey.eckey.getPub());
      pubKeys.push($scope.bitgoKey.eckey.getPub());
      var address = Bitcoin.Address.createMultiSigAddress(pubKeys, 2);

      $scope.multisigAddress = address.toString();
    };


    $scope.$watch('userKey', function(userKey) {
      if (userKey) {
        console.log("userkey changed to " + userKey.extended_public_key_string());
        computeAddress();
      }
    });

    $scope.$watch('backupKey', function(backupKey) {
      if (backupKey) {
        console.log("backupkey changed to " + backupKey.extended_public_key_string());
        computeAddress();
      }
    });

    $scope.$watch('bitgoKey', function(bitgoKey) {
      if (bitgoKey) {
        console.log("bitgokey changed to " + bitgoKey.extended_public_key_string());
        computeAddress();
      }
    });
  }
]);
