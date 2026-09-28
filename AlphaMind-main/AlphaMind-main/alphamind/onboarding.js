/**
 * AlphaMind — onboarding.js
 * ========================================================
 * Mandatory 3-step onboarding sequence shown ONCE, immediately
 * after successful signup/OTP verification, before the user is
 * allowed to reach dashboard.html:
 *
 *   1. Disclaimer        (must Agree, or signup is cancelled)
 *   2. Privacy Policy     (must Agree + confirm 18+, or cancelled)
 *   3. Platform Guide     (single "Got it" button -> dashboard.html)
 *
 * Does NOT modify index.html, dashboard.html, binance.js, or charts.js.
 * Renders entirely into the empty container index.html should add:
 *
 *     <div id="onboardingContainer"></div>
 *
 * and is triggered by calling:
 *
 *     window.AlphaMind.startOnboarding();
 *
 * See the full integration notes at the bottom of this file's
 * accompanying chat response for exactly where to add the script
 * tag and call this function in index.html's signup flow.
 * ======================================================== */

"use strict";

(function () {

  /* ================================================================
     STORAGE KEYS
  ================================================================ */
  var KEY_ONBOARDING_DONE = "alphamind_onboarding_complete";
  var KEY_THEME = "alphamind_theme";
  var KEY_LANG  = "alphamind_lang";

  // Defensive cleanup list for "I Disagree" — clears anything that
  // might represent a session/login state in this or a future backend,
  // without assuming a specific shape (index.html's current prototype
  // doesn't yet persist a real session token, but this stays safe if
  // one is added later).
  var SESSION_KEYS_TO_CLEAR = [
    "alphamind_session",
    "alphamind_user",
    "alphamind_token",
    "alphamind_auth",
    "alphamind_signup_pending",
    KEY_ONBOARDING_DONE
  ];

  var DASHBOARD_URL = "dashboard.html";
  var LOGIN_PAGE_URL = "index.html";

  /* ================================================================
     STATE
  ================================================================ */
  var currentStep = 0; // 0 = not started, 1/2/3 = active popup
  var onboardingLang = "en";
  var ageConfirmed = false;
  var rootEl = null;

  /* ================================================================
     CONTENT — DISCLAIMER (Popup 1)
  ================================================================ */
  var DISCLAIMER_EN = {
    title: "Disclaimer",
    body: ''
      + '<p><strong>Please read this disclaimer carefully before using AlphaMind.</strong> By clicking '
      + '"I Agree &amp; Continue" below, you acknowledge that you have read, understood, and accepted '
      + 'every point in this disclaimer in full.</p>'

      + '<h4>1. Educational and Informational Purpose Only</h4>'
      + '<p>AlphaMind provides AI-generated market analysis, technical indicator readings, and trading '
      + 'signals for cryptocurrency markets. All content produced by this platform — including signals, '
      + 'confidence scores, entry/stop-loss/take-profit levels, leverage suggestions, and written reasoning — '
      + 'is provided strictly for educational and informational purposes. None of it constitutes professional '
      + 'investment, financial, legal, or tax advice of any kind.</p>'

      + '<h4>2. Not Financial Advice</h4>'
      + '<p>Nothing displayed within AlphaMind should be interpreted as a recommendation, solicitation, or '
      + 'offer to buy, sell, or hold any cryptocurrency, token, or financial instrument. You should '
      + 'independently evaluate any information presented here and, where appropriate, consult a licensed '
      + 'financial advisor before making any trading or investment decision.</p>'

      + '<h4>3. No Automated Trading or Fund Access</h4>'
      + '<p>AlphaMind does NOT execute trades on your behalf under any circumstances. The platform does not '
      + 'connect to, control, or place orders on any exchange account. All trading decisions, order placement, '
      + 'position sizing, and execution are performed manually by you, at your sole discretion, directly on '
      + 'your own exchange account. AlphaMind never requests, stores, has access to, or holds custody of your '
      + 'funds, exchange API keys with trading/withdrawal permissions, or any other assets.</p>'

      + '<h4>4. Substantial Risk of Loss</h4>'
      + '<p>Trading and investing in cryptocurrency carries a high degree of risk and is not suitable for '
      + 'every individual. The value of cryptocurrencies can be extremely volatile, and you may lose some or '
      + 'all of your invested capital, including in leveraged futures positions where losses can exceed your '
      + 'original margin. The past performance or historical accuracy of any signal, indicator, or AI-generated '
      + 'analysis is not indicative of, and does not guarantee, future results.</p>'

      + '<h4>5. Your Sole Responsibility</h4>'
      + '<p>You acknowledge that you are solely responsible for your own trading decisions and their '
      + 'consequences. You trade entirely at your own risk and based on your own judgment, financial '
      + 'situation, and risk tolerance.</p>'

      + '<h4>6. Limitation of Liability</h4>'
      + '<p>AlphaMind, its developer(s), employees, and affiliates shall not be held liable for any direct, '
      + 'indirect, incidental, consequential, or any other form of financial loss, damage, or claim arising '
      + 'from your use of, or reliance on, any information, signal, or feature provided by this platform.</p>'

      + '<h4>7. Acceptable Use</h4>'
      + '<p>This platform and your subscription are licensed for your individual, personal use only. Sharing, '
      + 'reselling, or otherwise distributing your account access or subscription credentials to others, or '
      + 'any other violation of AlphaMind\'s Terms of Service, may result in immediate suspension or permanent '
      + 'termination of your account without refund.</p>'

      + '<p style="margin-top:18px;">If you do not agree with any part of this disclaimer, you must select '
      + '"I Disagree" below and you will not be able to create an AlphaMind account.</p>',
    disagree: "I Disagree",
    agree: "I Agree &amp; Continue"
  };

  var DISCLAIMER_UR = {
    title: "اعلانِ دستبرداری",
    body: ''
      + '<p><strong>AlphaMind استعمال کرنے سے پہلے براہ کرم یہ اعلانِ دستبرداری غور سے پڑھیں۔</strong> '
      + 'نیچے "میں متفق ہوں اور جاری رکھیں" پر کلک کر کے، آپ تصدیق کرتے ہیں کہ آپ نے اس اعلانِ دستبرداری کا '
      + 'ہر نکتہ مکمل طور پر پڑھ، سمجھ اور قبول کر لیا ہے۔</p>'

      + '<h4>1. صرف تعلیمی اور معلوماتی مقصد</h4>'
      + '<p>AlphaMind کرپٹو کرنسی مارکیٹوں کے لیے اے آئی سے تیار شدہ مارکیٹ تجزیہ، تکنیکی اشارے، اور '
      + 'ٹریڈنگ سگنلز فراہم کرتا ہے۔ اس پلیٹ فارم کی تمام معلومات — بشمول سگنلز، اعتماد کے اسکورز، انٹری/اسٹاپ '
      + 'لاس/ٹیک پرافٹ کی سطحیں، لیوریج کی تجاویز، اور تحریری وضاحتیں — مکمل طور پر تعلیمی اور معلوماتی مقاصد '
      + 'کے لیے فراہم کی جاتی ہیں۔ ان میں سے کوئی بھی پیشہ ورانہ سرمایہ کاری، مالیاتی، قانونی، یا ٹیکس کے '
      + 'مشورے کے طور پر شمار نہیں ہوتا۔</p>'

      + '<h4>2. مالی مشورہ نہیں</h4>'
      + '<p>AlphaMind میں دکھائی جانے والی کوئی بھی چیز کسی بھی کرپٹو کرنسی، ٹوکن، یا مالیاتی آلے کو خریدنے، '
      + 'بیچنے، یا رکھنے کی سفارش، درخواست، یا پیشکش نہیں سمجھی جانی چاہیے۔ آپ کو یہاں پیش کی گئی معلومات کا '
      + 'آزادانہ جائزہ لینا چاہیے، اور ضرورت پڑنے پر کوئی بھی ٹریڈنگ یا سرمایہ کاری کا فیصلہ کرنے سے پہلے کسی '
      + 'لائسنس یافتہ مالیاتی مشیر سے مشورہ کرنا چاہیے۔</p>'

      + '<h4>3. کوئی خودکار ٹریڈنگ یا فنڈز تک رسائی نہیں</h4>'
      + '<p>AlphaMind کسی بھی صورت میں آپ کی جانب سے ٹریڈز انجام نہیں دیتا۔ یہ پلیٹ فارم کسی بھی ایکسچینج '
      + 'اکاؤنٹ سے منسلک نہیں ہوتا، اسے کنٹرول نہیں کرتا، اور نہ ہی اس پر آرڈرز دیتا ہے۔ تمام ٹریڈنگ فیصلے، '
      + 'آرڈر دینا، پوزیشن کا حجم، اور عملدرآمد آپ خود، اپنی صوابدید پر، براہ راست اپنے ایکسچینج اکاؤنٹ پر کرتے '
      + 'ہیں۔ AlphaMind کبھی بھی آپ کے فنڈز، ٹریڈنگ/واپسی کی اجازت والی ایکسچینج API چابیاں، یا کسی بھی دیگر '
      + 'اثاثے کی درخواست، رسائی، ذخیرہ، یا تحویل نہیں رکھتا۔</p>'

      + '<h4>4. نقصان کا قابلِ ذکر خطرہ</h4>'
      + '<p>کرپٹو کرنسی میں ٹریڈنگ اور سرمایہ کاری میں زیادہ خطرہ شامل ہے اور یہ ہر فرد کے لیے موزوں نہیں۔ '
      + 'کرپٹو کرنسیوں کی قیمت انتہائی غیر مستحکم ہو سکتی ہے، اور آپ اپنا سرمایہ کاری شدہ سرمایہ جزوی یا مکمل '
      + 'طور پر کھو سکتے ہیں، بشمول لیوریجڈ فیوچرز پوزیشنز جہاں نقصان آپ کے اصل مارجن سے زیادہ ہو سکتا ہے۔ '
      + 'کسی بھی سگنل، اشارے، یا اے آئی سے تیار شدہ تجزیے کی ماضی کی کارکردگی یا تاریخی درستگی مستقبل کے '
      + 'نتائج کی ضمانت نہیں دیتی۔</p>'

      + '<h4>5. آپ کی واحد ذمہ داری</h4>'
      + '<p>آپ تصدیق کرتے ہیں کہ آپ اپنے ٹریڈنگ فیصلوں اور ان کے نتائج کے لیے واحد طور پر ذمہ دار ہیں۔ آپ '
      + 'مکمل طور پر اپنے خطرے پر اور اپنی صوابدید، مالی حالت، اور خطرے کی برداشت کی بنیاد پر ٹریڈ کرتے ہیں۔</p>'

      + '<h4>6. ذمہ داری کی حد</h4>'
      + '<p>AlphaMind، اس کے ڈویلپر(ز)، ملازمین، اور ذیلی ادارے اس پلیٹ فارم کی فراہم کردہ کسی بھی معلومات، '
      + 'سگنل، یا خصوصیت کے استعمال یا اس پر انحصار سے پیدا ہونے والے کسی بھی براہ راست، بلاواسطہ، ضمنی، '
      + 'نتیجہ خیز، یا کسی بھی دیگر قسم کے مالی نقصان، نقصان، یا دعوے کے لیے ذمہ دار نہیں ہوں گے۔</p>'

      + '<h4>7. قابلِ قبول استعمال</h4>'
      + '<p>یہ پلیٹ فارم اور آپ کی سبسکرپشن صرف آپ کے انفرادی، ذاتی استعمال کے لیے لائسنس یافتہ ہیں۔ اپنے '
      + 'اکاؤنٹ تک رسائی یا سبسکرپشن کی تفصیلات دوسروں کے ساتھ شیئر کرنا، دوبارہ فروخت کرنا، یا کسی بھی دیگر '
      + 'طریقے سے تقسیم کرنا، یا AlphaMind کی شرائط خدمت کی کوئی بھی خلاف ورزی، آپ کے اکاؤنٹ کی فوری معطلی یا '
      + 'بغیر کسی رقم کی واپسی کے مستقل بندش کا باعث بن سکتی ہے۔</p>'

      + '<p style="margin-top:18px;">اگر آپ اس اعلانِ دستبرداری کے کسی بھی حصے سے متفق نہیں ہیں، تو آپ کو '
      + 'نیچے "میں متفق نہیں ہوں" کا انتخاب کرنا ہوگا اور آپ AlphaMind اکاؤنٹ نہیں بنا سکیں گے۔</p>',
    disagree: "میں متفق نہیں ہوں",
    agree: "میں متفق ہوں اور جاری رکھیں"
  };

  /* ================================================================
     CONTENT — PRIVACY POLICY (Popup 2)
  ================================================================ */
  var PRIVACY_EN = {
    title: "Privacy Policy",
    body: ''
      + '<p><strong>This Privacy Policy explains what information AlphaMind collects and how it is used.</strong> '
      + 'Please read it carefully before continuing.</p>'

      + '<h4>1. Information We Collect</h4>'
      + '<p>To provide and operate AlphaMind, we collect: (a) account information you provide directly, such '
      + 'as your name and email address; (b) login and authentication activity, including sign-in timestamps '
      + 'and session details, used to keep your account secure; (c) basic device and technical information, '
      + 'such as browser type, operating system, and approximate location derived from IP address, used for '
      + 'security and fraud-prevention purposes; and (d) usage analytics, such as which features you interact '
      + 'with, to help us understand how the platform is used and where it can be improved.</p>'

      + '<h4>2. We Never Sell Your Data</h4>'
      + '<p>AlphaMind does not sell, rent, or trade your personal data to third parties for marketing or any '
      + 'other commercial purpose. Your information is not a product.</p>'

      + '<h4>3. How We Use Your Data</h4>'
      + '<p>The information we collect is used solely to: provide, maintain, and improve the AlphaMind service; '
      + 'authenticate your account and protect it from unauthorized access; detect, investigate, and prevent '
      + 'fraudulent, abusive, or illegal activity; communicate with you about your account or important service '
      + 'updates; and comply with applicable legal obligations.</p>'

      + '<h4>4. Data Security</h4>'
      + '<p>We apply reasonable technical and organizational safeguards designed to protect your information '
      + 'from unauthorized access, alteration, or disclosure. However, no method of electronic storage or '
      + 'transmission is completely secure, and we cannot guarantee absolute security.</p>'

      + '<h4>5. Age Requirement</h4>'
      + '<p>AlphaMind is intended for use only by individuals who are 18 years of age or older. By using this '
      + 'platform, you confirm that you meet this age requirement. We do not knowingly collect personal '
      + 'information from anyone under the age of 18.</p>'

      + '<div style="margin:18px 0;padding:13px 14px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.3);border-radius:10px;">'
      + '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.85rem;line-height:1.5;">'
      + '<input type="checkbox" id="onbAgeCheckbox" style="margin-top:3px;width:17px;height:17px;flex-shrink:0;cursor:pointer;accent-color:#d4af37;" />'
      + '<span>I confirm I am 18 years of age or older.</span>'
      + '</label>'
      + '</div>'

      + '<h4>6. Your Right to Data Deletion</h4>'
      + '<p>You may request deletion of your personal data at any time by contacting our support team at '
      + '<strong>support@alphamind.io</strong>. We will process verified deletion requests in accordance with '
      + 'applicable data protection laws.</p>'

      + '<p style="margin-top:18px;">If you do not agree with this Privacy Policy, you must select '
      + '"I Disagree" below and you will not be able to create an AlphaMind account.</p>',
    disagree: "I Disagree",
    agree: "I Agree &amp; Continue",
    ageRequiredNotice: "Please confirm you are 18 years of age or older to continue."
  };

  var PRIVACY_UR = {
    title: "پرائیویسی پالیسی",
    body: ''
      + '<p><strong>یہ پرائیویسی پالیسی وضاحت کرتی ہے کہ AlphaMind کون سی معلومات جمع کرتا ہے اور انہیں کیسے '
      + 'استعمال کیا جاتا ہے۔</strong> آگے بڑھنے سے پہلے براہ کرم اسے غور سے پڑھیں۔</p>'

      + '<h4>1. ہم کون سی معلومات جمع کرتے ہیں</h4>'
      + '<p>AlphaMind فراہم کرنے اور چلانے کے لیے، ہم جمع کرتے ہیں: (الف) اکاؤنٹ کی معلومات جو آپ براہ راست '
      + 'فراہم کرتے ہیں، جیسے آپ کا نام اور ای میل ایڈریس؛ (ب) لاگ ان اور تصدیق کی سرگرمی، بشمول سائن ان کے '
      + 'اوقات اور سیشن کی تفصیلات، جو آپ کے اکاؤنٹ کو محفوظ رکھنے کے لیے استعمال ہوتی ہیں؛ (ج) بنیادی ڈیوائس '
      + 'اور تکنیکی معلومات، جیسے براؤزر کی قسم، آپریٹنگ سسٹم، اور IP ایڈریس سے حاصل شدہ تخمینی مقام، جو '
      + 'سیکیورٹی اور دھوکہ دہی کی روک تھام کے لیے استعمال ہوتی ہیں؛ اور (د) استعمال کا تجزیہ، جیسے آپ کون سی '
      + 'خصوصیات استعمال کرتے ہیں، تاکہ ہم سمجھ سکیں کہ پلیٹ فارم کیسے استعمال ہو رہا ہے۔</p>'

      + '<h4>2. ہم آپ کا ڈیٹا کبھی فروخت نہیں کرتے</h4>'
      + '<p>AlphaMind آپ کا ذاتی ڈیٹا مارکیٹنگ یا کسی بھی دیگر تجارتی مقصد کے لیے تیسرے فریق کو فروخت، کرایہ '
      + 'پر، یا تجارت نہیں کرتا۔ آپ کی معلومات کوئی پروڈکٹ نہیں ہیں۔</p>'

      + '<h4>3. ہم آپ کا ڈیٹا کیسے استعمال کرتے ہیں</h4>'
      + '<p>ہم جو معلومات جمع کرتے ہیں وہ صرف اس کے لیے استعمال ہوتی ہیں: AlphaMind سروس فراہم کرنا، برقرار '
      + 'رکھنا، اور بہتر بنانا؛ آپ کے اکاؤنٹ کی تصدیق اور اسے غیر مجاز رسائی سے محفوظ رکھنا؛ دھوکہ دہی، بدسلوکی، '
      + 'یا غیر قانونی سرگرمی کا پتہ لگانا، تحقیق کرنا، اور روکنا؛ آپ کے اکاؤنٹ یا اہم سروس کی تازہ کاریوں کے '
      + 'بارے میں آپ سے رابطہ کرنا؛ اور قابلِ اطلاق قانونی ذمہ داریوں کی تکمیل کرنا۔</p>'

      + '<h4>4. ڈیٹا کی سیکیورٹی</h4>'
      + '<p>ہم آپ کی معلومات کو غیر مجاز رسائی، تبدیلی، یا انکشاف سے بچانے کے لیے ڈیزائن کیے گئے مناسب تکنیکی '
      + 'اور انتظامی تحفظات لاگو کرتے ہیں۔ تاہم، الیکٹرانک ذخیرہ یا ترسیل کا کوئی بھی طریقہ مکمل طور پر محفوظ '
      + 'نہیں ہوتا، اور ہم مطلق سیکیورٹی کی ضمانت نہیں دے سکتے۔</p>'

      + '<h4>5. عمر کی ضرورت</h4>'
      + '<p>AlphaMind صرف ان افراد کے استعمال کے لیے ہے جن کی عمر 18 سال یا اس سے زیادہ ہے۔ اس پلیٹ فارم کا '
      + 'استعمال کر کے، آپ تصدیق کرتے ہیں کہ آپ اس عمر کی ضرورت پر پورا اترتے ہیں۔ ہم جانتے بوجھتے 18 سال سے '
      + 'کم عمر کسی بھی فرد سے ذاتی معلومات جمع نہیں کرتے۔</p>'

      + '<div style="margin:18px 0;padding:13px 14px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.3);border-radius:10px;" dir="rtl">'
      + '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.85rem;line-height:1.6;">'
      + '<input type="checkbox" id="onbAgeCheckboxUr" style="margin-top:3px;width:17px;height:17px;flex-shrink:0;cursor:pointer;accent-color:#d4af37;" />'
      + '<span>میں تصدیق کرتا/کرتی ہوں کہ میری عمر 18 سال یا اس سے زیادہ ہے۔</span>'
      + '</label>'
      + '</div>'

      + '<h4>6. ڈیٹا حذف کرنے کا آپ کا حق</h4>'
      + '<p>آپ کسی بھی وقت ہماری سپورٹ ٹیم سے <strong>support@alphamind.io</strong> پر رابطہ کر کے اپنا ذاتی '
      + 'ڈیٹا حذف کرنے کی درخواست کر سکتے ہیں۔ ہم قابلِ اطلاق ڈیٹا تحفظ کے قوانین کے مطابق تصدیق شدہ حذف کرنے '
      + 'کی درخواستوں پر عمل کریں گے۔</p>'

      + '<p style="margin-top:18px;">اگر آپ اس پرائیویسی پالیسی سے متفق نہیں ہیں، تو آپ کو نیچے "میں متفق نہیں '
      + 'ہوں" کا انتخاب کرنا ہوگا اور آپ AlphaMind اکاؤنٹ نہیں بنا سکیں گے۔</p>',
    disagree: "میں متفق نہیں ہوں",
    agree: "میں متفق ہوں اور جاری رکھیں",
    ageRequiredNotice: "جاری رکھنے کے لیے براہ کرم تصدیق کریں کہ آپ کی عمر 18 سال یا اس سے زیادہ ہے۔"
  };

  /* ================================================================
     CONTENT — PLATFORM GUIDE (Popup 3)
  ================================================================ */
  var GUIDE_EN = {
    title: "Welcome to AlphaMind",
    body: ''
      + '<p>Here\'s a quick guide to help you get the most out of AlphaMind before you head to your dashboard.</p>'

      + '<h4>What is AlphaMind?</h4>'
      + '<p>AlphaMind is an AI-powered market analysis and signal terminal built for crypto traders. It '
      + 'watches live price action and technical indicators, and uses AI to turn that data into clear, '
      + 'structured trading signals — so you can spend less time staring at charts and more time making '
      + 'informed decisions.</p>'

      + '<h4>How to Use It</h4>'
      + '<ol style="padding-left:20px;margin:8px 0;line-height:1.8;">'
      + '<li>Select a coin from the coin list on the left of your dashboard (e.g. BTC, ETH, SOL).</li>'
      + '<li>Choose whether you want a <strong>Spot</strong> or <strong>Futures</strong> analysis using the '
      + 'toggle in the top bar.</li>'
      + '<li>Click <strong>Generate Signal</strong> to let the AI analyze current price action, momentum, '
      + 'and trend indicators.</li>'
      + '<li>Review the signal: direction (Long/Short/Neutral), confidence score, suggested entry, stop-loss, '
      + 'and multiple take-profit targets, along with the AI\'s written reasoning.</li>'
      + '<li>Make your own trading decision and, if you choose to act on it, place the trade yourself directly '
      + 'on your own exchange account.</li>'
      + '</ol>'

      + '<h4>What You\'ll Find Inside</h4>'
      + '<ul style="padding-left:20px;margin:8px 0;line-height:1.8;">'
      + '<li><strong>Live charts</strong> with multiple timeframes and indicators (RSI, MACD, EMA, Bollinger '
      + 'Bands, Volume).</li>'
      + '<li><strong>AI signals</strong> with confidence scores and, for futures, volatility-based leverage '
      + 'suggestions (capped at a conservative maximum).</li>'
      + '<li><strong>Multiple take-profit targets</strong> (TP1–TP4) so you can scale out of a position '
      + 'gradually rather than all at once.</li>'
      + '<li><strong>News-aware analysis</strong> that factors recent headlines into the AI\'s reasoning.</li>'
      + '<li><strong>Full English/Urdu support</strong> throughout the entire platform.</li>'
      + '</ul>'

      + '<div style="margin-top:18px;padding:13px 14px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.3);border-radius:10px;font-size:0.85rem;line-height:1.6;">'
      + '<strong>One more reminder:</strong> every signal AlphaMind generates is a suggestion based on '
      + 'available data — not a guarantee. You are always in control, and every trade you place is your own '
      + 'decision.'
      + '</div>',
    button: "Got it, Take Me to Dashboard"
  };

  var GUIDE_UR = {
    title: "AlphaMind میں خوش آمدید",
    body: ''
      + '<p>اپنے ڈیش بورڈ پر جانے سے پہلے، AlphaMind کا بھرپور فائدہ اٹھانے میں مدد کے لیے یہاں ایک مختصر '
      + 'گائیڈ ہے۔</p>'

      + '<h4>AlphaMind کیا ہے؟</h4>'
      + '<p>AlphaMind کرپٹو ٹریڈرز کے لیے بنایا گیا ایک اے آئی پاورڈ مارکیٹ تجزیہ اور سگنل ٹرمینل ہے۔ یہ '
      + 'لائیو قیمت کی حرکت اور تکنیکی اشاروں پر نظر رکھتا ہے، اور اس ڈیٹا کو واضح، منظم ٹریڈنگ سگنلز میں '
      + 'تبدیل کرنے کے لیے اے آئی استعمال کرتا ہے — تاکہ آپ چارٹس پر کم وقت صرف کریں اور باخبر فیصلے کرنے پر '
      + 'زیادہ وقت دیں۔</p>'

      + '<h4>اسے کیسے استعمال کریں</h4>'
      + '<ol style="padding-right:20px;margin:8px 0;line-height:1.8;">'
      + '<li>اپنے ڈیش بورڈ کے بائیں جانب کوائن لسٹ سے ایک کوائن منتخب کریں (مثلاً BTC, ETH, SOL)۔</li>'
      + '<li>ٹاپ بار میں موجود ٹوگل استعمال کرتے ہوئے فیصلہ کریں کہ آپ <strong>اسپاٹ</strong> یا '
      + '<strong>فیوچرز</strong> تجزیہ چاہتے ہیں۔</li>'
      + '<li>اے آئی کو موجودہ قیمت کی حرکت، رفتار، اور رجحان کے اشاروں کا تجزیہ کرنے دینے کے لیے '
      + '<strong>سگنل بنائیں</strong> پر کلک کریں۔</li>'
      + '<li>سگنل کا جائزہ لیں: سمت (لانگ/شارٹ/غیر جانبدار)، اعتماد کا اسکور، تجویز کردہ انٹری، اسٹاپ لاس، '
      + 'اور متعدد ٹیک پرافٹ ہدف، اے آئی کی تحریری وضاحت کے ساتھ۔</li>'
      + '<li>اپنا ٹریڈنگ فیصلہ خود کریں اور، اگر آپ اس پر عمل کرنے کا انتخاب کرتے ہیں، تو خود اپنے ایکسچینج '
      + 'اکاؤنٹ پر براہ راست ٹریڈ کریں۔</li>'
      + '</ol>'

      + '<h4>آپ کو اندر کیا ملے گا</h4>'
      + '<ul style="padding-right:20px;margin:8px 0;line-height:1.8;">'
      + '<li><strong>لائیو چارٹس</strong> متعدد ٹائم فریمز اور اشاروں کے ساتھ (RSI, MACD, EMA, بولنگر بینڈز، '
      + 'والیوم)۔</li>'
      + '<li><strong>اے آئی سگنلز</strong> اعتماد کے اسکورز کے ساتھ اور، فیوچرز کے لیے، اتار چڑھاؤ کی بنیاد '
      + 'پر لیوریج کی تجاویز (ایک محتاط زیادہ سے زیادہ حد کے ساتھ)۔</li>'
      + '<li><strong>متعدد ٹیک پرافٹ ہدف</strong> (TP1–TP4) تاکہ آپ پوزیشن سے بتدریج باہر نکل سکیں، ایک ساتھ '
      + 'نہیں۔</li>'
      + '<li><strong>خبروں سے باخبر تجزیہ</strong> جو تازہ ترین سرخیوں کو اے آئی کی وضاحت میں شامل کرتا ہے۔</li>'
      + '<li>پورے پلیٹ فارم میں <strong>مکمل انگریزی/اردو سپورٹ</strong>۔</li>'
      + '</ul>'

      + '<div style="margin-top:18px;padding:13px 14px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.3);border-radius:10px;font-size:0.85rem;line-height:1.6;" dir="rtl">'
      + '<strong>ایک اور یاد دہانی:</strong> AlphaMind کا تیار کردہ ہر سگنل دستیاب ڈیٹا کی بنیاد پر ایک تجویز '
      + 'ہے — ضمانت نہیں۔ آپ ہمیشہ کنٹرول میں ہیں، اور آپ کی ہر ٹریڈ آپ کا اپنا فیصلہ ہے۔'
      + '</div>',
    button: "ٹھیک ہے، مجھے ڈیش بورڈ پر لے جائیں"
  };

  /* ================================================================
     SCOPED CSS — injected once, reuses AlphaMind's brand tokens
     so this matches index.html/dashboard.html without depending
     on either of their stylesheets being present.
  ================================================================ */
  function injectStyles() {
    if (document.getElementById("alphamindOnboardingStyles")) return;

    var css = ''
      + '#onboardingContainer { position: relative; z-index: 9999; }'
      + '.onb-overlay {'
      + '  position: fixed; inset: 0; background: rgba(0,0,0,0.85);'
      + '  display: flex; align-items: center; justify-content: center;'
      + '  padding: 20px; z-index: 9999; opacity: 0; transition: opacity 0.3s ease;'
      + '  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;'
      + '}'
      + '.onb-overlay.onb-visible { opacity: 1; }'
      + '.onb-card {'
      + '  background: #ffffff; color: #1a1a1a; width: 100%; max-width: 560px;'
      + '  max-height: 88vh; border-radius: 20px; display: flex; flex-direction: column;'
      + '  box-shadow: 0 30px 80px rgba(0,0,0,0.5); transform: scale(0.92) translateY(16px);'
      + '  opacity: 0; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.35s ease;'
      + '  border: 1px solid #e7e9ee; overflow: hidden;'
      + '}'
      + '[data-theme="dark"] .onb-card, body.onb-dark .onb-card {'
      + '  background: #161b22; color: #e6e6e6; border-color: #262d3a;'
      + '}'
      + '.onb-overlay.onb-visible .onb-card { transform: scale(1) translateY(0); opacity: 1; }'
      + '.onb-header {'
      + '  display: flex; align-items: center; justify-content: space-between; gap: 12px;'
      + '  padding: 22px 26px 16px; border-bottom: 1px solid #e7e9ee; flex-shrink: 0;'
      + '}'
      + '[data-theme="dark"] .onb-header, body.onb-dark .onb-header { border-color: #262d3a; }'
      + '.onb-title-block { display: flex; align-items: center; gap: 11px; }'
      + '.onb-logo { width: 34px; height: 34px; flex-shrink: 0; }'
      + '.onb-title { font-size: 1.18rem; font-weight: 800; letter-spacing: -0.01em; margin: 0; }'
      + '.onb-step-badge {'
      + '  font-size: 0.66rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;'
      + '  color: #d4af37; margin-top: 2px;'
      + '}'
      + '.onb-lang-btn {'
      + '  display: flex; align-items: center; gap: 5px; background: #fbfbfd; border: 1px solid #e7e9ee;'
      + '  border-radius: 99px; padding: 6px 13px; font-size: 0.74rem; font-weight: 700; color: #5b6472;'
      + '  cursor: pointer; transition: all 0.25s ease; flex-shrink: 0; white-space: nowrap;'
      + '}'
      + '[data-theme="dark"] .onb-lang-btn, body.onb-dark .onb-lang-btn {'
      + '  background: #0f141b; border-color: #262d3a; color: #9aa4b5;'
      + '}'
      + '.onb-lang-btn:hover { border-color: #d4af37; color: #1a1a1a; }'
      + '[data-theme="dark"] .onb-lang-btn:hover, body.onb-dark .onb-lang-btn:hover { color: #e6e6e6; }'
      + '.onb-body {'
      + '  padding: 20px 26px; overflow-y: auto; flex: 1; font-size: 0.88rem; line-height: 1.7;'
      + '}'
      + '.onb-body h4 {'
      + '  font-size: 0.86rem; font-weight: 700; margin: 16px 0 6px; color: #1a2b4c;'
      + '}'
      + '[data-theme="dark"] .onb-body h4, body.onb-dark .onb-body h4 { color: #e6c768; }'
      + '.onb-body h4:first-child { margin-top: 0; }'
      + '.onb-body p { margin: 0 0 4px; }'
      + '.onb-body ul, .onb-body ol { margin: 6px 0; }'
      + '.onb-body::-webkit-scrollbar { width: 7px; }'
      + '.onb-body::-webkit-scrollbar-thumb { background: #e7e9ee; border-radius: 4px; }'
      + '[data-theme="dark"] .onb-body::-webkit-scrollbar-thumb, body.onb-dark .onb-body::-webkit-scrollbar-thumb { background: #262d3a; }'
      + '.onb-footer {'
      + '  display: flex; gap: 10px; padding: 16px 26px 22px; border-top: 1px solid #e7e9ee; flex-shrink: 0;'
      + '}'
      + '[data-theme="dark"] .onb-footer, body.onb-dark .onb-footer { border-color: #262d3a; }'
      + '.onb-btn {'
      + '  flex: 1; border: none; border-radius: 12px; padding: 13px 16px; font-size: 0.88rem;'
      + '  font-weight: 700; cursor: pointer; transition: all 0.25s ease; font-family: inherit;'
      + '}'
      + '.onb-btn-disagree {'
      + '  background: none; border: 1.5px solid #e7e9ee; color: #5b6472;'
      + '}'
      + '[data-theme="dark"] .onb-btn-disagree, body.onb-dark .onb-btn-disagree { border-color: #262d3a; color: #9aa4b5; }'
      + '.onb-btn-disagree:hover { border-color: #ef4444; color: #ef4444; }'
      + '.onb-btn-agree {'
      + '  background: #1a2b4c; color: #ffffff; box-shadow: 0 6px 18px rgba(26,43,76,0.25);'
      + '}'
      + '.onb-btn-agree:hover { background: #233a64; transform: translateY(-1px); }'
      + '.onb-btn-agree:disabled {'
      + '  opacity: 0.45; cursor: not-allowed; transform: none;'
      + '}'
      + '.onb-btn-single {'
      + '  background: linear-gradient(135deg, #b8932a, #d4af37, #b8932a); color: #1a2b4c;'
      + '  box-shadow: 0 6px 18px rgba(212,175,55,0.3);'
      + '}'
      + '.onb-btn-single:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(212,175,55,0.4); }'
      + '.onb-age-notice {'
      + '  font-size: 0.74rem; color: #ef4444; margin-top: -4px; padding: 0 26px 12px; display: none;'
      + '}'
      + '.onb-age-notice.onb-show { display: block; }'
      + '[dir="rtl"] .onb-body, [dir="rtl"] .onb-footer { direction: rtl; }'
      + '.onb-rtl { direction: rtl; text-align: right; font-family: "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", serif; }'
      + '.onb-rtl h4, .onb-rtl p, .onb-rtl li { font-family: "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", serif; }'
      + '@media (max-width: 480px) {'
      + '  .onb-card { max-height: 92vh; border-radius: 16px; }'
      + '  .onb-header { padding: 18px 18px 14px; }'
      + '  .onb-body { padding: 16px 18px; font-size: 0.85rem; }'
      + '  .onb-footer { padding: 14px 18px 18px; flex-direction: column; }'
      + '  .onb-title { font-size: 1.05rem; }'
      + '}'
      + '@media (prefers-reduced-motion: reduce) {'
      + '  .onb-overlay, .onb-card { transition-duration: 0.001ms !important; }'
      + '}';

    var styleTag = document.createElement("style");
    styleTag.id = "alphamindOnboardingStyles";
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
  }

  /* ================================================================
     THEME DETECTION — mirrors index.html's data-theme attribute,
     with a class-based fallback in case onboarding.js is ever used
     on a page that doesn't set data-theme on <body>.
  ================================================================ */
  function isDarkMode() {
    var bodyTheme = document.body.getAttribute("data-theme");
    if (bodyTheme) return bodyTheme === "dark";
    try {
      return localStorage.getItem(KEY_THEME) === "dark";
    } catch (e) {
      return false;
    }
  }

  function getSavedLanguage() {
    try {
      return localStorage.getItem(KEY_LANG) === "ur" ? "ur" : "en";
    } catch (e) {
      return "en";
    }
  }

  /* ================================================================
     LOGO SVG — same alpha-mark used across index.html/dashboard.html
  ================================================================ */
  function logoSvg() {
    return ''
      + '<svg class="onb-logo" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<rect x="1" y="1" width="38" height="38" rx="10" fill="#1a2b4c"/>'
      + '<rect x="1" y="1" width="38" height="38" rx="10" fill="none" stroke="#d4af37" stroke-width="1" opacity="0.5"/>'
      + '<text x="20" y="27" font-family="Georgia, \'Times New Roman\', serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#d4af37">α</text>'
      + '</svg>';
  }

  /* ================================================================
     CORE RENDER HELPERS
  ================================================================ */
  function ensureRoot() {
    rootEl = document.getElementById("onboardingContainer");
    if (!rootEl) {
      console.warn("[onboarding.js] #onboardingContainer not found in the DOM. " +
        "Creating one and appending it to <body> as a fallback — add the container " +
        "div to index.html for cleaner integration.");
      rootEl = document.createElement("div");
      rootEl.id = "onboardingContainer";
      document.body.appendChild(rootEl);
    }
    return rootEl;
  }

  function clearRoot() {
    if (rootEl) rootEl.innerHTML = "";
  }

  function applyOnboardingDarkClass() {
    document.body.classList.toggle("onb-dark", isDarkMode());
  }

  /* ================================================================
     POPUP 1 — DISCLAIMER
  ================================================================ */
  function renderDisclaimer() {
    currentStep = 1;
    var content = onboardingLang === "ur" ? DISCLAIMER_UR : DISCLAIMER_EN;
    var isRtl = onboardingLang === "ur";

    var html = ''
      + '<div class="onb-overlay" id="onbOverlay">'
      + '  <div class="onb-card" ' + (isRtl ? 'dir="rtl"' : 'dir="ltr"') + '>'
      + '    <div class="onb-header">'
      + '      <div class="onb-title-block">'
      + logoSvg()
      + '        <div>'
      + '          <p class="onb-title">' + escapeAttr(content.title) + '</p>'
      + '          <p class="onb-step-badge">' + (isRtl ? 'مرحلہ 1 از 3' : 'STEP 1 OF 3') + '</p>'
      + '        </div>'
      + '      </div>'
      + '      <button class="onb-lang-btn" id="onbLangBtn" type="button">'
      + (isRtl ? 'English' : 'اردو')
      + '      </button>'
      + '    </div>'
      + '    <div class="onb-body' + (isRtl ? ' onb-rtl' : '') + '">' + content.body + '</div>'
      + '    <div class="onb-footer">'
      + '      <button class="onb-btn onb-btn-disagree" id="onbDisagreeBtn" type="button">' + content.disagree + '</button>'
      + '      <button class="onb-btn onb-btn-agree" id="onbAgreeBtn" type="button">' + content.agree + '</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    clearRoot();
    rootEl.innerHTML = html;
    requestAnimationFrame(function () {
      var overlay = document.getElementById("onbOverlay");
      if (overlay) overlay.classList.add("onb-visible");
    });

    document.getElementById("onbLangBtn").addEventListener("click", function () {
      onboardingLang = onboardingLang === "ur" ? "en" : "ur";
      renderDisclaimer();
    });

    document.getElementById("onbDisagreeBtn").addEventListener("click", handleDisagree);
    document.getElementById("onbAgreeBtn").addEventListener("click", function () {
      renderPrivacyPolicy();
    });

    installModalGuards();
  }

  /* ================================================================
     POPUP 2 — PRIVACY POLICY (with 18+ checkbox gating)
  ================================================================ */
  function renderPrivacyPolicy() {
    currentStep = 2;
    var content = onboardingLang === "ur" ? PRIVACY_UR : PRIVACY_EN;
    var isRtl = onboardingLang === "ur";
    var checkboxId = isRtl ? "onbAgeCheckboxUr" : "onbAgeCheckbox";

    var html = ''
      + '<div class="onb-overlay" id="onbOverlay">'
      + '  <div class="onb-card" ' + (isRtl ? 'dir="rtl"' : 'dir="ltr"') + '>'
      + '    <div class="onb-header">'
      + '      <div class="onb-title-block">'
      + logoSvg()
      + '        <div>'
      + '          <p class="onb-title">' + escapeAttr(content.title) + '</p>'
      + '          <p class="onb-step-badge">' + (isRtl ? 'مرحلہ 2 از 3' : 'STEP 2 OF 3') + '</p>'
      + '        </div>'
      + '      </div>'
      + '      <button class="onb-lang-btn" id="onbLangBtn" type="button">'
      + (isRtl ? 'English' : 'اردو')
      + '      </button>'
      + '    </div>'
      + '    <div class="onb-body' + (isRtl ? ' onb-rtl' : '') + '">' + content.body + '</div>'
      + '    <p class="onb-age-notice" id="onbAgeNotice">' + content.ageRequiredNotice + '</p>'
      + '    <div class="onb-footer">'
      + '      <button class="onb-btn onb-btn-disagree" id="onbDisagreeBtn" type="button">' + content.disagree + '</button>'
      + '      <button class="onb-btn onb-btn-agree" id="onbAgreeBtn" type="button" disabled>' + content.agree + '</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    clearRoot();
    rootEl.innerHTML = html;
    requestAnimationFrame(function () {
      var overlay = document.getElementById("onbOverlay");
      if (overlay) overlay.classList.add("onb-visible");
    });

    document.getElementById("onbLangBtn").addEventListener("click", function () {
      onboardingLang = onboardingLang === "ur" ? "en" : "ur";
      renderPrivacyPolicy();
    });

    document.getElementById("onbDisagreeBtn").addEventListener("click", handleDisagree);

    var ageCheckbox = document.getElementById(checkboxId);
    var agreeBtn = document.getElementById("onbAgreeBtn");
    var ageNotice = document.getElementById("onbAgeNotice");

    if (ageCheckbox) {
      ageCheckbox.checked = ageConfirmed; // preserve state across language toggle
      ageCheckbox.addEventListener("change", function () {
        ageConfirmed = ageCheckbox.checked;
        agreeBtn.disabled = !ageConfirmed;
        if (ageConfirmed) ageNotice.classList.remove("onb-show");
      });
      agreeBtn.disabled = !ageConfirmed;
    }

    agreeBtn.addEventListener("click", function () {
      if (!ageConfirmed) {
        ageNotice.classList.add("onb-show");
        return;
      }
      renderPlatformGuide();
    });

    installModalGuards();
  }

  /* ================================================================
     POPUP 3 — PLATFORM GUIDE
  ================================================================ */
  function renderPlatformGuide() {
    currentStep = 3;
    var content = onboardingLang === "ur" ? GUIDE_UR : GUIDE_EN;
    var isRtl = onboardingLang === "ur";

    var html = ''
      + '<div class="onb-overlay" id="onbOverlay">'
      + '  <div class="onb-card" ' + (isRtl ? 'dir="rtl"' : 'dir="ltr"') + '>'
      + '    <div class="onb-header">'
      + '      <div class="onb-title-block">'
      + logoSvg()
      + '        <div>'
      + '          <p class="onb-title">' + escapeAttr(content.title) + '</p>'
      + '          <p class="onb-step-badge">' + (isRtl ? 'مرحلہ 3 از 3' : 'STEP 3 OF 3') + '</p>'
      + '        </div>'
      + '      </div>'
      + '      <button class="onb-lang-btn" id="onbLangBtn" type="button">'
      + (isRtl ? 'English' : 'اردو')
      + '      </button>'
      + '    </div>'
      + '    <div class="onb-body' + (isRtl ? ' onb-rtl' : '') + '">' + content.body + '</div>'
      + '    <div class="onb-footer">'
      + '      <button class="onb-btn onb-btn-single" id="onbFinishBtn" type="button">' + content.button + '</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    clearRoot();
    rootEl.innerHTML = html;
    requestAnimationFrame(function () {
      var overlay = document.getElementById("onbOverlay");
      if (overlay) overlay.classList.add("onb-visible");
    });

    document.getElementById("onbLangBtn").addEventListener("click", function () {
      onboardingLang = onboardingLang === "ur" ? "en" : "ur";
      renderPlatformGuide();
    });

    document.getElementById("onbFinishBtn").addEventListener("click", handleFinishOnboarding);

    installModalGuards();
  }

  /* ================================================================
     MODAL GUARDS — block Escape key and outside-click dismissal,
     per the "cannot be closed" requirement. Re-installed on every
     render since the overlay element is recreated each time.
  ================================================================ */
  function installModalGuards() {
    document.removeEventListener("keydown", blockEscapeKey, true);
    document.addEventListener("keydown", blockEscapeKey, true);

    var overlay = document.getElementById("onbOverlay");
    if (overlay) {
      overlay.addEventListener("click", function (e) {
        // Only the card's own buttons should ever close/advance the
        // modal — clicking the dark backdrop itself does nothing.
        if (e.target === overlay) {
          e.stopPropagation();
        }
      });
    }
  }

  function blockEscapeKey(e) {
    if (currentStep > 0 && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function removeModalGuards() {
    document.removeEventListener("keydown", blockEscapeKey, true);
  }

  /* ================================================================
     DISAGREE HANDLER — cancels signup, clears state, redirects
  ================================================================ */
  function handleDisagree() {
    currentStep = 0;
    removeModalGuards();

    SESSION_KEYS_TO_CLEAR.forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    });
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }

    clearRoot();

    var message = onboardingLang === "ur"
      ? "AlphaMind استعمال کرنے کے لیے آپ کو اعلانِ دستبرداری قبول کرنا ہوگا۔"
      : "You must accept the disclaimer to use AlphaMind.";

    // Pass the message via a query param so index.html can optionally
    // display it (index.html doesn't need any changes to function —
    // this is purely informational for a future enhancement). We also
    // show a plain browser alert as a guaranteed-visible fallback,
    // since index.html doesn't currently read this query param.
    window.alert(message);

    var redirectUrl = LOGIN_PAGE_URL + "?notice=" + encodeURIComponent(message);
    window.location.href = redirectUrl;
  }

  /* ================================================================
     FINISH HANDLER — marks onboarding complete, goes to dashboard
  ================================================================ */
  function handleFinishOnboarding() {
    currentStep = 0;
    removeModalGuards();

    try {
      localStorage.setItem(KEY_ONBOARDING_DONE, "true");
    } catch (e) {
      console.warn("[onboarding.js] Could not persist onboarding completion flag:", e.message);
    }

    clearRoot();
    window.location.href = DASHBOARD_URL;
  }

  /* ================================================================
     UTIL
  ================================================================ */
  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function hasCompletedOnboarding() {
    try {
      return localStorage.getItem(KEY_ONBOARDING_DONE) === "true";
    } catch (e) {
      return false;
    }
  }

  /* ================================================================
     PUBLIC ENTRY POINT
     ----------------------------------------------------------------
     window.AlphaMind.startOnboarding()
     Call this immediately after a successful signup / OTP
     verification, BEFORE navigating to dashboard.html. If onboarding
     was already completed previously (flag already set), this skips
     straight to dashboard.html instead of showing the popups again —
     satisfying the "never shows again" requirement even if something
     calls startOnboarding() more than once by mistake.
  ================================================================ */
  function startOnboarding() {
    if (hasCompletedOnboarding()) {
      window.location.href = DASHBOARD_URL;
      return;
    }

    injectStyles();
    ensureRoot();
    applyOnboardingDarkClass();

    onboardingLang = getSavedLanguage();
    ageConfirmed = false;

    renderDisclaimer();
  }

  /* ================================================================
     EXPOSE — window.AlphaMind.startOnboarding()
     index.html does not currently define window.AlphaMind, so this
     creates the namespace defensively rather than assuming it exists.
  ================================================================ */
  window.AlphaMind = window.AlphaMind || {};
  window.AlphaMind.startOnboarding = startOnboarding;

  // Also expose a bare top-level alias for convenience/debugging.
  window.startAlphaMindOnboarding = startOnboarding;

})();