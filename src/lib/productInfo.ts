// Bilingual product descriptions + custom unit labels, keyed by itemKey.
// These are UTC's catalogue descriptions; the quotation renders the matching
// language under each line item, and the unit label replaces the generic one.

export interface Bilingual {
  en: string
  ar: string
}
export interface ProductInfo {
  unit: Bilingual
  desc: Bilingual
}

export const PRODUCT_INFO: Record<string, ProductInfo> = {
  FEEDING: {
    unit: { en: 'lines', ar: 'خطوط' },
    desc: {
      en: 'Automatic pan feeding system (ROXELL NEW MiniMax). Includes suspension and lifting mechanism, hot-dip galvanised pipes, each fitted with 4 plastic pans (14-hole, resistant to disinfectants and detergents). Also includes: spiral auger for feed distribution, ON/OFF motor switch with overload protection, activation sensors, 1 fill hopper per line (line start), 1 drive motor per line (line end).',
      ar: 'نظام التغذية الأوتوماتيكية (بان فيدر) ROXELL NEW MiniMax — النظام يشمل نظام التعليق والرفع والمواسير المجلفنة، وكل ماسورة مزودة بعدد 4 أطباق بلاستيك مقاوم للمطهرات والمنظفات (الطبق 14 فتحة). يشمل: الأوجر (السوستة الحلزونية) لتوزيع العلف على الأطباق، مفتاح تشغيل وحماية ON/OFF، حساسات التشغيل، حلة ملء العلف (بداية الخط)، موتور التشغيل (نهاية الخط).',
    },
  },
  DRINKING: {
    unit: { en: 'lines', ar: 'خطوط' },
    desc: {
      en: 'Automatic nipple drinking system (ROXELL). Smooth opaque PVC pipes, each pipe fitted with 15 stainless-steel nipples coated with plastic anti-corrosion layer, flexible couplings between pipes (2 stainless-steel clips per coupling), hanging clamps on galvanised iron rail, ceiling-mounted winch suspension. Includes: pressure regulators (1 per line) and end-of-line kits (2 per line).',
      ar: 'نظام الشرب الأوتوماتيك (نبل) ROXELL — مواسير PVC ملساء غير شفافة، كل ماسورة مزودة بـ15 نبلًا من الاستانلس مغطى بطبقة بلاستيك لمقاومة الصدأ، وصلات مرنة بين المواسير (2 أفيز استانلس لكل وصلة)، كبات ومشابك لتثبيت الماسورة على الحديد المجلفن، الونش سقفي. يشمل منظمات ضغط ومجموعات نهاية الخط.',
    },
  },
  HEATER: {
    unit: { en: 'heaters', ar: 'هيتر' },
    desc: {
      en: 'UTC heating unit (Italian and Turkish components, locally assembled). Fitted with RELLO igniter made from stainless steel with internal insulation and temperature sensor for precise climate control. Indirect electric ignition, runs on diesel fuel. Each unit includes: 2 × 1 m flue connection pipes + elbow + chimney cap + fresh-air intake connection. Easy to install.',
      ar: 'هيتر UTC — خامات إيطالية وتركية، تقفيل محلي، مزود بولاعة RELLO مصنوعة من الصلب الذي لا يصدأ مع العزل الداخلي، مزود بحساس حرارة للتحكم في درجات الحرارة. يعمل بالإشعال الغير مباشر كهرباء مع السولار. مزود بعدد 2 وصلة مدخنة بطول 1 متر للوصلة + كوع + طربوش + وصلة الفريش آير.',
    },
  },
  TUNNEL_FAN: {
    unit: { en: 'fans', ar: 'شفاط' },
    desc: {
      en: 'PERICOLI (Italy) exhaust fan, 1.5 HP 3-phase motor, model EWS 53, size 138 × 138 cm. Fitted with external shutter and internal wire mesh to prevent entry of foreign objects.',
      ar: 'شفاط بريكولي إيطالي موتور 1.5 حصان 3 فاز، موديل EWS 53، مقاس 138 × 138 سم. الشفاط مزود بشطر خارجي وسلك من الداخل لمنع دخول الأجسام الغريبة.',
    },
  },
  SIDE_FAN: {
    unit: { en: 'fans', ar: 'شفاط' },
    desc: {
      en: 'PERICOLI (Italy) exhaust fan, 1 HP 3-phase motor, model EWS 42, size 115 × 115 cm. Fitted with external shutter and internal wire mesh to prevent entry of foreign objects.',
      ar: 'شفاط بريكولي إيطالي موتور 1 حصان 3 فاز، موديل EWS 42، مقاس 115 × 115 سم. الشفاط مزود بشطر خارجي وسلك من الداخل لمنع دخول الأجسام الغريبة.',
    },
  },
  CIRC_FAN: {
    unit: { en: 'fans', ar: 'مروحة' },
    desc: {
      en: 'PERICOLI (Italy) circulation fans, 3-phase motor, model ACF 21 P. Each fan fitted with wire mesh guard to prevent entry of foreign objects.',
      ar: 'مراوح تقليب بريكولي إيطالي موتور 3 فاز، موديل ACF 21 P. المروحة مزودة بسلك لمنع دخول الأجسام الغريبة.',
    },
  },
  AIR_INLET: {
    unit: { en: 'inlets', ar: 'شباك' },
    desc: {
      en: 'UTC air inlet (Turkish "Airanlit" brand), size 56 × 26 cm. Fitted with graduated angle bracket for controlled opening angle. Includes full suspension and installation accessories, with 1 actuator motor per side wall.',
      ar: 'شباك إيرانلت تركي UTC، مقاس 56 × 26 سم. الشباك مزود بزاوية تدريج تسمح بالتحكم بزاوية فتح الشباك. يشمل اكسسوارات التعليق والتركيب كاملة مع المواتير — ماتور 1 لكل جنب.',
    },
  },
  TUNNEL_INLET: {
    unit: { en: 'set', ar: 'نظام' },
    desc: {
      en: 'Tunnel ventilation inlet system, installed on the air inlet openings of the cooling pad section. Each side: 27 m length × 1 m height. Opening/closing angle is motor-controlled.',
      ar: 'نظام أنفاق التهوية لخلايا التبريد Tunnel inlet — يثبت النظام على فتحات دخول الهواء من الخلايا. طول الجانب 27 م وارتفاع 1 م × 2 جنب. يتم التحكم في النظام عن طريق موتور للتحكم في زاوية فتح وغلق الأنفاق.',
    },
  },
  COOLING_PAD: {
    unit: { en: 'pads', ar: 'لوح' },
    desc: {
      en: 'Cooling pad cells, size 150 × 60 × 15 cm, produced by Smart Falcon.',
      ar: 'خلايا تبريد مقاس 150 × 60 × 15 سم، إنتاج شركة سمارت فالكون.',
    },
  },
  COOLING_CHANNEL: {
    unit: { en: 'meter', ar: 'متر' },
    desc: {
      en: 'Cooling pad channels made from PVC, 27 m long per side (2 sides). Includes full suspension accessories, plastic piping, side frames, and pump.',
      ar: 'قنوات التبريد مصنعة من PVC بطول 27 متر طول (2 جنب). يشمل كامل اكسسوار التعليق والماسورة البلاستيك والأجناب والطلمبة.',
    },
  },
  CONTROL_PANEL: {
    unit: { en: 'unit', ar: 'وحدة' },
    desc: {
      en: 'SKOV control panel with DOL 534 high-resolution colour display for full automated climate management (temperature, humidity, negative pressure). Includes: 2 × DOL 114 sensors, 3 × DOL 12 sensors, climate reporting, 2 × DA175 tunnel motors, and PC remote monitoring capability. Also includes main power distribution panels.',
      ar: 'لوحة التحكم SKOV مزودة بشاشة موديل DOL 534 ملونة ذات دقة عالية للتحكم الأوتوماتيكي الكامل في المناخ (درجات الحرارة، الرطوبة، الضغط السلبي). تشمل عدد 2 حساس DOL 114 وعدد 3 حساس DOL 12 مع تقارير المناخ وعدد 2 موتور DA175 للتانيل وإمكانية التواصل والتحكم عن طريق الكمبيوتر. بالإضافة للوحات الباور الرئيسية.',
    },
  },
  SILO: {
    unit: { en: 'silo', ar: 'سايلو' },
    desc: {
      en: 'Silo system (ROXELL) — manufactured from corrugated heavy-galvanised panels to minimise temperature fluctuations inside the silo, with a smooth protective inner lining. Flex auger system (ROXELL): built from Novicor 90 mm pipes resistant to UV, heat, and corrosion (operating time 2 hours/day), ensuring safe transfer of all feed types (fine / pelleted) while maintaining biosecurity levels. Auger length: 18 m, conveying feed from the silo into the house to supply the feed lines.',
      ar: 'نظام السايلو ROXELL — مصنع من ألواح مموجة مجلفنة (نظام الجلفنة الثقيلة) لتقليل تقلبات درجات الحرارة داخل السايلو، بالإضافة إلى طبقة واقية ملساء من الداخل. نظام الفليكس أوجر ROXELL: مكون من أنابيب Novicor قطر 90 مم المقاومة للأشعة فوق البنفسجية ودرجة الحرارة والتآكل (مدة تشغيل ساعتين في اليوم)، حيث يضمن الأوجر النقل الآمن لأنواع العلف المختلفة (ناعم – محبب) بالإضافة للمحافظة على مستويات الأمن الحيوي. الأوجر بطول 18 متر طولي لنقل العلف من السايلو إلى داخل العنبر لتزويد الخطوط بالعلف.',
    },
  },
  EXTERNAL_LOADER: {
    unit: { en: 'loader', ar: 'ملو' },
    desc: {
      en: 'External loader — locally manufactured from 6-inch iron pipes. Does not include the loading hopper.',
      ar: 'الملو الخارجي — محلي الصنع من مواسير حديد بقطر 6 بوصة، لا يشمل قادوس الملو.',
    },
  },
}

/** Map a quote line to a PRODUCT_INFO key, via calc_meta.itemKey or name match. */
export function itemKeyForLine(line: {
  description_snapshot?: string | null
  brand_snapshot?: string | null
  calc_meta?: Record<string, unknown> | null
}): string | null {
  const fromCalc = line.calc_meta && typeof line.calc_meta.itemKey === 'string' ? (line.calc_meta.itemKey as string) : null
  if (fromCalc && PRODUCT_INFO[fromCalc]) return fromCalc
  const d = (line.description_snapshot ?? '').toLowerCase()
  if (!d) return null
  if (d.includes('silo') || d.includes('سايلو') || d.includes('auger')) return 'SILO'
  if (d.includes('loader') || d.includes('ملو') || d.includes('mallow')) return 'EXTERNAL_LOADER'
  if (d.includes('control') || d.includes('dol 534') || d.includes('skov')) return 'CONTROL_PANEL'
  if (d.includes('tunnel inlet') || d.includes('أنفاق')) return 'TUNNEL_INLET'
  return null
}
