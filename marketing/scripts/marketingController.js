/**
 * @ngdoc controller
 * @name LandingController
 * @description
 * Manages logic for the BitGo main landing page
 */
angular.module('BitGo.Marketing.MarketingController', [])

.controller('MarketingController', ['$location', '$scope', '$rootScope', 'NotifyService', 'EnterpriseAPI',
  function($location, $scope, $rootScope, NotifyService, EnterpriseAPI) {

    // We have one controller for all of the marketing pages, so we track
    // context switches using this URL-context map
    var URL_CONTEXT_MAP = {
      '/': 'marketingHome',
      '/platform': 'marketingAPI',
      '/enterprise': 'marketingEnterprise'
    };

    // the user info object that is submitted when someone inquires about API or platform
    $scope.userInfo = null;

    // Slide quotes for the landing page
    $scope.slides = [
      {
        msg: 'BitGo is the only company in the industry we trust to secure our hot wallet.  The integration was very straightforward, and now I can sleep better at night knowing that my customers’ holdings are secured with BitGo.',
        person: 'Nejc Kodrič',
        company: 'Bitstamp',
        position: 'CEO'
      },
      {
        msg: 'The BitGo Platform API will be an integral part of our core infrastructure.  Our systems need to be highly secure, scalable and reliable, and BitGo is the only platform that can operate at those requirements.',
        person: 'Danny Yang',
        company: 'MaiCoin',
        position: 'CEO'
      },
      {
        msg: 'BitGo offers a robust API layer, making it much easier to integrate our clients\' multisig wallets. Their entire team was extremely helpful during the setup process.',
        person: 'Greg Schvey',
        company: 'TradeBlock',
        position: 'CEO'
      },
    ];

    /**
    * Checks if form is valid befor esubmission
    * @private
    */
    function formIsValid() {
      return $scope.userInfo.email && $scope.userInfo.email !== '';
    }

    /**
    * Resets the platform/api inquiry form
    * @private
    */
    function resetForm() {
      $scope.userInfo = {
        company: "",
        email: "",
        industry: "",
        name: "",
        phone: ""
      };
    }

    /**
    * Sends a new enterprise inquiry to the marketing team
    * @public
    */
    $scope.onSubmitForm = function() {
      if (formIsValid()) {
        EnterpriseAPI.createInquiry($scope.userInfo)
        .then(function() {
          NotifyService.success('Your request was sent, and we\'ll be in touch with you soon.');
          resetForm();
        })
        .catch(function() {
          NotifyService.error('There was an issue with submitting your form. Can you please try that again?');
        });
      }
    };

    function init() {
      $rootScope.setContext(URL_CONTEXT_MAP[$location.path()]);

      resetForm();
    }
    init();
  }
]);
