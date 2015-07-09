/*
  About:
  - The BitGo.Settings module is the main module that deals with the main
  app user's account information, settings, and state
*/
angular.module('BitGo.Settings', [
  // Modules for BitGo.Settings composition
  'BitGo.Settings.AboutFormDirective',
  'BitGo.Settings.DevelopersAccesstokenAddFormDirective',
  'BitGo.Settings.DevelopersManagerDirective',
  'BitGo.Settings.PasswordFormDirective',
  'BitGo.Settings.PlansFormDirective',
  'BitGo.Settings.PreferencesCurrencyFormDirective',
  'BitGo.Settings.PreferencesNotificationFormDirective',
  'BitGo.Settings.PhoneFormDirective',
  'BitGo.Settings.SettingsController'
]);
