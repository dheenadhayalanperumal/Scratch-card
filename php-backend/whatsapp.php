<?php
// WhatsApp Business Cloud API (Meta) — PHP port of backend/src/whatsapp.js.
// Runs in SIMULATION mode when no token/phone-number id is configured.

require_once __DIR__ . '/config.php';

function wa_isLiveConfigured($settings) {
  $phoneId = ($settings['waPhoneNumberId'] ?? '') ?: WHATSAPP_PHONE_NUMBER_ID;
  return (bool)(WHATSAPP_ACCESS_TOKEN && $phoneId);
}

// Local number -> E.164 digits, e.g. "9876543210" -> "919876543210".
function wa_toE164($mobile) {
  $digits = preg_replace('/\D/', '', (string)$mobile);
  if (strlen($digits) === 10) return WHATSAPP_DEFAULT_COUNTRY_CODE . $digits;
  return $digits;
}

function wa_renderTemplate($body, $vars) {
  $map = [
    '[Name]' => 'name', '[Business Name]' => 'business', '[Prize]' => 'prize',
    '[CODE]' => 'code', '[Days]' => 'days',
  ];
  $text = $body ?? '';
  foreach ($map as $token => $key) {
    $text = str_replace($token, (string)($vars[$key] ?? ''), $text);
  }
  return $text;
}

// Ordered body params for a Meta approved template: {{1}} name, {{2}} code, {{3}} date.
function wa_templateParams($vars) {
  return array_map(fn($t) => ['type' => 'text', 'text' => (string)($t ?? '')],
                   [$vars['name'] ?? '', $vars['code'] ?? '', $vars['date'] ?? '']);
}

function wa_post($url, $payload) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
      'Authorization: Bearer ' . WHATSAPP_ACCESS_TOKEN,
      'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_TIMEOUT => 20,
  ]);
  $resp = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);
  return ['status' => $status, 'body' => $resp, 'error' => $err];
}

// Free-form text message (admin broadcasts).
function wa_sendText($settings, $mobile, $text) {
  if (empty($settings['waEnabled'])) return ['status' => 'disabled', 'text' => $text];
  if (!wa_isLiveConfigured($settings)) return ['status' => 'simulated', 'text' => $text];

  $phoneId = ($settings['waPhoneNumberId'] ?? '') ?: WHATSAPP_PHONE_NUMBER_ID;
  $url = 'https://graph.facebook.com/' . WHATSAPP_API_VERSION . "/$phoneId/messages";
  $r = wa_post($url, [
    'messaging_product' => 'whatsapp',
    'to' => wa_toE164($mobile),
    'type' => 'text',
    'text' => ['body' => $text],
  ]);
  if ($r['error'] || $r['status'] < 200 || $r['status'] >= 300)
    return ['status' => 'failed', 'text' => $text, 'error' => $r['error'] ?: ('HTTP ' . $r['status'])];
  return ['status' => 'sent', 'text' => $text];
}

// Spin-reward message (approved template when live, rendered text otherwise).
function wa_sendSpinReward($opts) {
  $settings = $opts['settings'] ?? [];
  $vars = [
    'name' => $opts['name'] ?? 'there',
    'business' => $settings['brandName'] ?? 'our store',
    'prize' => $opts['prize'] ?? '',
    'code' => $opts['code'] ?? '',
    'days' => $opts['days'] ?? '',
    'date' => $opts['date'] ?? date('M j, Y'),
  ];
  $body = $opts['body'] ?? ($settings['waTemplateBody'] ?? '');
  $text = wa_renderTemplate($body, $vars);

  if (empty($settings['waEnabled'])) return ['status' => 'disabled', 'text' => $text];
  if (!wa_isLiveConfigured($settings)) return ['status' => 'simulated', 'text' => $text];

  $phoneId = ($settings['waPhoneNumberId'] ?? '') ?: WHATSAPP_PHONE_NUMBER_ID;
  $url = 'https://graph.facebook.com/' . WHATSAPP_API_VERSION . "/$phoneId/messages";
  $r = wa_post($url, [
    'messaging_product' => 'whatsapp',
    'to' => wa_toE164($opts['mobile'] ?? ''),
    'type' => 'template',
    'template' => [
      'name' => ($settings['waTemplateName'] ?? '') ?: DEFAULT_TEMPLATE_NAME,
      'language' => ['code' => WHATSAPP_TEMPLATE_LANG],
      'components' => [['type' => 'body', 'parameters' => wa_templateParams($vars)]],
    ],
  ]);
  if ($r['error'] || $r['status'] < 200 || $r['status'] >= 300)
    return ['status' => 'failed', 'text' => $text, 'error' => $r['error'] ?: ('HTTP ' . $r['status'])];
  return ['status' => 'sent', 'text' => $text];
}
