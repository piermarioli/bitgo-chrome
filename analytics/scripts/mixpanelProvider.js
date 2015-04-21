/**
 * @ngdoc service
 * @name MixpanelProvider
 * @description
 * This manages the analytics calls to Mixpanel
 */
angular.module('BitGo.Analytics.MixpanelProvider', [])

.factory('MixpanelProvider', ['$rootScope', 'BG_DEV',
  function($rootScope, BG_DEV) {

    /**
    * Initialize Mixpanel analytics
    * @private
    */
    function init() {
      if (typeof(mixpanel.init) !== 'function') {
        throw new Error('Missing Mixpanel');
      }
      mixpanel.init(BG_DEV.ANALYTICS.MIXPANEL.APP_TOKEN);
      return true;
    }

    /**
    * Kill Mixpanel analytics for the current user (usually called on logout)
    * @private
    */
    function shutdown() {
      // Mixpanel is unclear about how to handle user logouts - best practices are used below
      // https://github.com/mixpanel/mixpanel-android/issues/97
      // http://stackoverflow.com.80bola.com/questions/21137286/what-should-i-do-when-users-log-out/22059786
      mixpanel.cookie.clear();
      init("");
      return true;
    }


    // Event Tracking

    /**
    * Track a generic event in Mixpanel
    * @param eventName {String}
    * @param eventData {Object}
    * @private
    */

    // Additional Notes on Tracking Mixpanel Events:
    //
    // TRACKING
    // ==============================
    // For different events, we expect specific properties to come along
    // when the event is registered in Mixpanel
    //
    // All Error Events:
    //  status: server's error status || 'client'
    //  message: server's error msg || custom client message
    //  action: What action the user was taking to trigger the error
    //
    // Nav Events:
    //  location: next location that the user is navigating to

    function track(eventName, eventData) {
      if (!eventName) {
        throw new Error('invalid params');
      }
      if (eventData) {
        mixpanel.track(eventName, eventData);
        return true;
      }
      mixpanel.track(eventName);
      return true;
    }


    // Super Properties

    /**
    * Set data to be sent along with all tracking events in future tracking calls
    * @param data {Object}
    * @param registerOnce {Bool} (optional) Kills attempts to overwrite data later in the same session
    * @private
    */
    function register(data, registerOnce) {
      if (!data) {
        throw new Error('invalid params');
      }
      if (typeof(registerOnce) === 'boolean' && registerOnce) {
        mixpanel.register_once(data);
        return true;
      }
      mixpanel.register(data);
      return true;
    }


    // User Identification / Tracking

    // Notes:
    // The recommended usage pattern is to call mixpanel.alias when
    // the user signs up, and mixpanel.identify when they log in.
    // This will keep the BitGo signup funnels working correctly.

    /**
    * The recommended usage pattern is to call this when the user signs up
    * @param userID {String}
    * @private
    */
    function alias(userID) {
      if (!userID) {
        throw new Error('invalid params');
      }
      mixpanel.alias(userID);
      return true;
    }

    /**
    * The recommended usage pattern is to call this when the user logs in
    * @param userID {String}
    * @private
    */
    function identify(userID) {
      if (!userID) {
        throw new Error('invalid params');
      }
      mixpanel.identify(userID);
      return true;
    }

    // Initialize Mixpanel as soon as the app boots
    init();

    // In-app API

    // Notes:
    // We proxy analytics calls through a global analytics handler: AnalyticsProxy
    // The calls below are the used subset of all Mixpanel functions:
    // https://mixpanel.com/help/reference/javascript-full-api-reference

    return {
      init: init,
      shutdown: shutdown,
      // General Event Tracking
      track: track,
      // Super Properties
      register: register,
      // User Identification / Tracking
      identify: identify,
      alias: alias
    };
  }
]);
