/**
 * Notes: Creates QR codes based on data in the text attribute
 */
angular.module('BitGo.Common.BGQrCode', [])

.directive('bgQrCode', [
  function () {
    return {
      restrict: 'E',
      transclude: true,
      compile: function (element, attrs, transclude) {
        return function postLink(scope, iElement, iAttrs, controller) {
          iElement[0].complete = false;
          iAttrs.$observe('text', function (value) {
            var height = attrs.height ? parseInt(attrs.height, 10) : 200;
            var text = value.replace(/^\s+|\s+$/g, '');
            iElement[0].innerHTML = '';
            var qrcode = new QRCode(iElement[0], { height: height, width: height, correctLevel: 0});
            qrcode.makeCode(text);
            iElement[0].complete = true;
          });
        };
      }
    };
  }
]);
