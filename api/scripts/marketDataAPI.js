angular.module('BitGo.API.MarketDataAPI', ['ngResource'])

.factory('MarketDataAPI', ['$resource', '$http', '$rootScope', 'BG_DEV', 'UtilityService', 'CacheService',
  function($resource, $http, $rootScope, BG_DEV, Utils, CacheService) {
    var kApiServer = Utils.API.apiServer;
    var PromiseSuccessHelper = Utils.API.promiseSuccessHelper;
    var PromiseErrorHelper = Utils.API.promiseErrorHelper;
    var validators = Utils.Validators;

    var currencyCache = new CacheService.Cache('localStorage', 'Currency', 60 * 60 * 1000);
    var symbolMap = {
      "AUD": "A$",  // Australian/New Zealand Dollar
      "CAD": "C$",  // Canadian Dollar
      "CNY": "¥",   // Chinese Yuan
      "EUR": "€",   // European Euro
      "GBP": "£",   // British Pound
      "USD": "$",   // US dollar
      "ZAR": "R"    // South African Rand
    };

    // Listen for when the root user is set on the app,
    // update the app's currency to reflect their settings
    $rootScope.$on('UserAPI.CurrentUserSet', function() {
      try {
        var userCurrency = $rootScope.currentUser.settings.currency.currency;
        var userBitcoinUnit = $rootScope.currentUser.settings.currency.bitcoinUnit;
        if (userCurrency) {
          setInAppMarketData(userCurrency);
        }
        if (userBitcoinUnit) {
          setBitcoinUnit(userBitcoinUnit);
        }
      } catch(error) {
        console.log('Error updating app currency to user preferences', error);
      }
    });

    // Listens for changes in user currency settings
    $rootScope.$on('SettingsCurrencyForm.ChangeBitcoinUnit', function(evt, newUnit) {
      if (!validators.bitcoinUnitOk(newUnit)) {
        throw new Error(BG_DEV.ERRORS.INVALID_BITCOIN_UNIT);
      }
      setBitcoinUnit(newUnit);
    });

    $rootScope.$on('SettingsCurrencyForm.ChangeAppCurrency', function(evt, newCurrency) {
      if (!validators.currencyOk(newCurrency)) {
        throw new Error(BG_DEV.ERRORS.INVALID_CURRENCY);
      }
      setInAppMarketData(newCurrency);
    });

    // Blockchain Data Setters
    function setMarketCapData() {
      try {
        var cap = $rootScope.currency.data.current.last * $rootScope.blockchainData.blockchain.totalbc;
        $rootScope.blockchainData.marketcap = cap;
      } catch(error) {
        console.log('Error setting market cap data', error);
      }
    }

    function setBlockchainData() {
      try {
        $rootScope.blockchainData = {
          blockchain: currencyCache.storage.get('blockchain'),
          updateTime: currencyCache.storage.get('updateTime')
        };
      } catch(error) {
        console.log('Error setting blockchain data', error);
      }
    }

    // Financial Data Setter
    function setFinancialData() {
      var currency = getAppCurrency();
      try {
        $rootScope.currency = {
          currency: currency,
          bitcoinUnit: getBitcoinUnit(),
          symbol: symbolMap[currency],
          data: {
            current: currencyCache.get('current')[currency],
            previous: currencyCache.get('previous')[currency]
          }
        };
      } catch(error) {
        console.log('Error setting app financial data', error);
      }
    }

    // bitcoinUnit setter/getter
    function getBitcoinUnit() {
      var cachedBitcoinUnit = currencyCache.get('bitcoinUnit');
      return cachedBitcoinUnit ? cachedBitcoinUnit : $rootScope.currency.bitcoinUnit;
    }

    function setBitcoinUnit(unit) {
      if (!validators.bitcoinUnitOk(unit)) {
        throw new Error(BG_DEV.ERRORS.INVALID_BITCOIN_UNIT);
      }
      currencyCache.add('bitcoinUnit', unit);
      // update the app's financial data with the new unit
      setInAppMarketData(getAppCurrency());
    }

    // AppCurrency setter/getter
    function getAppCurrency() {
      var cachedCurrency = currencyCache.get('currency');
      return cachedCurrency ? cachedCurrency : $rootScope.currency.currency;
    }

    function setInAppMarketData(currency) {
      if (!validators.currencyOk(currency)) {
        throw new Error(BG_DEV.ERRORS.INVALID_CURRENCY);
      }
      currencyCache.add('currency', currency);
      // update the app's financial data with the new currency
      setFinancialData();
      setBlockchainData();
      setMarketCapData();
      $rootScope.$emit('MarketDataAPI.AppCurrencyUpdated', $rootScope.currency);
    }

    // CurrencyCache Setter
    function setCurrencyCache(data) {
      // Currency & Unit Data
      currencyCache.add('currency', getAppCurrency());
      currencyCache.add('bitcoinUnit', getBitcoinUnit());
      // Blockchain Data
      currencyCache.add('blockchain', data.latest.blockchain);
      currencyCache.add('updateTime', data.latest.updateTime);
      // Market Currency Data
      var previous = currencyCache.get('previous') ?
                     currencyCache.get('current') :
                     data.latest.currencies;
      currencyCache.add('previous', previous);
      currencyCache.add('current', data.latest.currencies);
    }

    // Initialization to set up the currency for the app before user and
    // financial data is returned
    function init() {
      // Initialize the app's fin/blockchain data - used throughout the app
      $rootScope.currency = {};
      $rootScope.blockchainData = {};
      // Initialize a currency for the app
      var storedAppCurrency = currencyCache.get('currency');
      $rootScope.currency.currency = storedAppCurrency ?
                                      storedAppCurrency :
                                      BG_DEV.CURRENCY.DEFAULTS.CURRENCY;
      // Initialize a bitcoinUnit for the app
      var cachedBitcoinUnit = currencyCache.get('bitcoinUnit');
      $rootScope.currency.bitcoinUnit = cachedBitcoinUnit ?
                                    cachedBitcoinUnit :
                                    BG_DEV.CURRENCY.DEFAULTS.BITCOIN_UNIT;
    }
    init();

    return {
      latest: function() {
        var resource = $resource(kApiServer + "/market/latest", {});
        return resource.get({}).$promise
        .then(
          function(result) {
            if (!_.isEmpty(result.latest.currencies)) {
              var currency = getAppCurrency();
              setCurrencyCache(result);
              setInAppMarketData(currency);
              return $rootScope.currency;
            }
          },
          PromiseErrorHelper()
        );
      },
      /**
       * Gets price of Bitcoin for a given currency and range
       *
       * @public
       * @param range {Integer}  - number of days to get prices for
       * param currency {String} - currency in which to get prices at
       */
      price: function(range, currency) {
        if (!range) {
          throw new Error('Need range when getting market data');
        }
        else if (!currency){
          throw new Error('Need currency when getting market data');
        }
        var resource = $resource(kApiServer + "/market/last/:range/:currency", {range: range, currency: currency});
        return resource.query({}).$promise
        .then(
          function(results) {
            var prices = [];
            var max = 0;
            var min = results[0][1];
            results.forEach(function(result) {
              prices.push({x: new Date(result[0] * 1000), y: result[1]});
              if (result[1] > max){
                max = result[1];
              }
              else if (min > result[1]){
                min = result[1];
              }
            });
            return {prices: prices, max: max, min: min};
          },
          PromiseErrorHelper()
        );
      }
    };
  }
]);
