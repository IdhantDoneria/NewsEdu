/**
 * Controlled topic taxonomy for interests and topic-follows.
 *
 * There is no free-text topic creation: users pick from this list, so no
 * uncontrolled duplicate labels can appear. Matching is deterministic (regex
 * over a cluster's title + entities), shared by briefing ranking and
 * topic-follow filtering.
 *
 * Patterns are stem-aware (Russia/Russian/Russians), cover demonyms, and use
 * contextual phrases for words that are ambiguous on their own ("war" in
 * "price war", "gas" in "tear gas", "who" the pronoun, "raises" the verb).
 * Each topic has a case-insensitive `re` and, for acronyms and names that are
 * only unambiguous in their written case (WHO, AI, Fed, Xi), a `cs` pattern.
 * Use topicMatches/topicsForText; `re` alone is not the whole matcher.
 *
 * The labelled evaluation set is tests/fixtures/labels/topics.json.
 */

const ci = (parts) => new RegExp(`\\b(?:${parts.join('|')})`, 'i');
const cs = (parts) => new RegExp(`\\b(?:${parts.join('|')})`);

// Finance/consumer nouns that make a bare "US" an adjective of an economic
// statistic or a company, not a political actor ("US bond sale", "US stocks").
const US_ECON = 'natural|oil|gas|lng|energy|crude|exports?|imports?|manufacturing|jobs|employment|unemployment|data|factory|industrial|autos?|cars?|business(?:es)?|stocks?|equit(?:y|ies)|bonds?|treasur(?:y|ies)|dollar|markets?|shares|futures|economy|gdp|inflation|yields?|consumers?|retail\\w*|housing|home|mortgage\\w*|earnings|compan(?:y|ies)|firms?|banks?|ipo|listing|offering|sale|sales|startups?|tech|crypto|bitcoin|etfs?|funds?|exchange';

export const TOPICS = [
  {
    id: 'us-politics', label: 'US Politics', kind: 'country',
    re: ci([
      'united states(?! (?:dollar|stocks|economy))',
      'u\\.s\\.a?\\.?(?!\\s+(?:' + US_ECON + ')\\b)',
      'america(?:n|ns)?\\b(?<!latin america)(?<!latin american)(?<!south america)(?<!south american)(?<!north america)(?<!central america)(?<!bank of america)',
      '(?<!george )washington(?! post| state| university| wizards| nationals| commanders| capitals)',
      'white house|(?:us|u\\.s\\.|american) congress|congressional|capitol hill|senate|senators?|house (?:republicans|democrats|speaker)|supreme court(?! of (?:india|canada|israel|pakistan|nigeria|kenya|the uk|the united kingdom))|birthright citizenship',
      'trump|biden|vance|bessent|rubio|hegseth|oval office|melania',
      'republicans?|democrats?|democratic (?:party|senators?|lawmakers?|campaign|nominee|governors?)|gop|maga',
      'pentagon|state dept\\.?|state department|justice department|attorney general|homeland security|us governors?',
      '(?:alabama|alaska|arizona|arkansas|california|colorado|florida|illinois|indiana|iowa|kansas|kentucky|louisiana|maryland|massachusetts|michigan|minnesota|mississippi|missouri|nebraska|nevada|new jersey|north carolina|ohio|oklahoma|oregon|pennsylvania|south carolina|tennessee|texas|utah|wisconsin)(?:\'s)?\\b',
    ]),
    cs: cs(['Congress\\b', 'US(?:A)?\\b(?!\\s+(?:' + US_ECON + ')\\b)']),
  },
  {
    id: 'china', label: 'China', kind: 'country',
    re: ci([
      'china(?!town)|chinese|beijing|xi jinping|taiwan strait|cross-strait|sino-|shanghai|shenzhen|huawei|alibaba|tencent|bytedance|deepseek|byd|pla\\b|prc\\b|ccp\\b|pboc|yuan|renminbi',
    ]),
    cs: cs(['Xi\\b(?!-)']),
  },
  {
    id: 'russia-ukraine', label: 'Russia & Ukraine', kind: 'conflict',
    re: ci([
      'russia(?:n|ns)?|ukrain(?:e|ian|ians)|kyiv|kiev|moscow|kremlin|putin|zelens?k(?:y|yy|iy)|donbas+|crimea|kharkiv|odesa|donetsk|zaporizhzhia|pokrovsk|lavrov|medvedev|wagner|russo-',
    ]),
  },
  {
    id: 'middle-east', label: 'Middle East', kind: 'region',
    re: ci([
      'israel(?:i|is)?|gaza|palestin(?:e|ian|ians)|west bank|rafah|jerusalem|tel aviv|netanyahu|knesset|idf\\b',
      'iran(?:ian|ians)?|tehran|khamenei|mashhad|strait of hormuz',
      'leban(?:on|ese)|beirut|hezbollah|hamas|houthis?|yemen(?:i|is)?|taiz|red sea',
      'syria(?:n|ns)?|damascus|iraq(?:i|is)?|baghdad|kurdish|kurds',
      'saudi(?: arabia)?|riyadh|uae\\b|emirates|emirati|qatar(?:i|is)?|doha|kuwait|bahrain|oman\\b|gulf (?:states|countries|arab)|persian gulf',
    ]),
  },
  {
    id: 'europe', label: 'Europe & EU', kind: 'region',
    re: ci([
      'europe(?:an)?|\\beu\\b|brussels|eurozone|euro area|ecb\\b|european central bank|nato\\b',
      'germany|german(?:s|y)?\\b(?! shepherd)|berlin|bundesbank|merz|scholz',
      'france|french\\b(?! fries| toast| kiss)|paris(?! hilton| agreement)|macron|marseille|lagarde',
      'britain|british|\\buk\\b|u\\.k\\.|england|london|scotland|wales\\b|starmer|reeves|bank of england|downing street',
      'spain|spanish|madrid|italy|italian|rome\\b|meloni|portugal|portuguese|greece|greek\\b|athens',
      'poland|netherlands|dutch|belgium|belgian|sweden|swedish|norway|norwegian|finland|finnish|denmark|danish|ireland|irish|switzerland|swiss\\b|austria|austrian|hungary|hungarian|orban|czech|romania|bulgaria|baltic',
    ]),
    cs: cs(['Polish\\b']),
  },
  {
    id: 'india', label: 'India', kind: 'country',
    re: ci([
      'india(?:n|ns)?\\b|delhi|mumbai|modi\\b|sensex|nifty|rbi\\b|reserve bank of india|sebi\\b|rupee|lakh|crore|bengaluru|bangalore|hyderabad|kolkata|chennai|lok sabha|bjp\\b|adani|ambani',
    ]),
  },
  {
    id: 'africa', label: 'Africa', kind: 'region',
    re: ci([
      'africa(?:n|ns)?|nigeria(?:n|ns)?|lagos|abuja|kenya(?:n|ns)?|nairobi|ethiopia(?:n|ns)?|addis ababa|tigray|amhara|sudan(?:ese)?|khartoum|el fasher|rsf\\b',
      'congo(?:lese)?|sahel|ghana(?:ian)?|uganda|tanzania|rwanda|somalia|zimbabwe|zambia|mozambique|senegal|cameroon|libya(?:n)?|morocc(?:o|an)|algeria(?:n)?|tunisia(?:n)?|egypt(?:ian)?|cairo|angola|ivory coast|madagascar|sahara|dangote|m23\\b|burkina faso|mali\\b',
    ]),
    cs: cs(['Niger\\b']),
  },
  {
    id: 'latin-america', label: 'Latin America', kind: 'region',
    re: ci([
      'latin america(?:n)?|caribbean|brazil(?:ian|ians)?|brasilia|s[aã]o paulo|bolsonaro|lula\\b|ibovespa',
      '(?<!new )(?<!gulf of )mexic(?:o|an|ans)\\b|sheinbaum',
      'argentin(?:a|e|ian|ians)|buenos aires|milei',
      'venezuela(?:n|ns)?|caracas|maduro|colombia(?:n|ns)?\\b|bogot[aá]|petro\\b',
      'chile(?:an|ans)?\\b|peru(?:vian|vians)?\\b|ecuador(?:ian)?|bolivia(?:n)?|uruguay|paraguay|haiti(?:an|ans)?|cuba\\b|cuban (?:government|regime|president|capital|exiles|migrants|coast)|havana|el salvador|bukele|guatemala|honduras|nicaragua|panama\\b|costa rica|santiago\\b',
    ]),
  },
  {
    id: 'trade-tariffs', label: 'Trade & Tariffs', kind: 'policy',
    re: ci([
      'tariffs?|trade (?:deals?|wars?|talks|pacts?|agreements?|disputes?|surplus|deficit|barriers?|partners?|tensions?|policy|curbs|restrictions|truce)',
      'export (?:controls?|curbs|bans?|restrictions)|import (?:duties|curbs|bans?|controls?|quotas?)|customs duties|anti-dumping|duties on',
      'sanctions?|sanctioned|embargo(?:es|ed)?|wto\\b|world trade organi[sz]ation|usmca|free trade|entity list',
    ]),
  },
  {
    id: 'defense-security', label: 'Defense & Security', kind: 'policy',
    re: ci([
      'military|armed forces|missiles?|warheads?|troops?|soldiers?|airstrikes?|air strikes?|ceasefires?|cease-fires?|(?<!trade )truces?|drills\\b|war ?games|shelling|artillery|explosions?',
      'fighting (?:rages?|erupts?|intensif\\w+|continues?|breaks?)|(?:deadly|armed|border) clashes|clashes? (?:with|between|erupt\\w*)',
      '(?:armed|terror\\w*|drone|missile|rocket|air|suicide|deadly|surprise|cyber|military|rebel|militant|gun) attacks?|attacks? (?:on|kills?|killed|hits?)\\b',
      'houthis?|hamas|hezbollah',
      '(?:russian|ukrainian|israeli|iranian|american|us|air|drone|missile|retaliatory|deadly|overnight|naval|precision|fresh) strikes?',
      'strikes? (?:on|in|at|near|hit|hits|kill|kills|killed|target\\w*) (?!workers)',
      'drones?(?! deliver\\w*| footage| show| photograph\\w*)',
      'nuclear(?! power| plants?| energy| reactors?| fuel| waste| fusion)',
      '(?:civil|world|cold|proxy|ground|air|naval|shadow|full-scale|all-out|drone|cyber) war\\b',
      'wars? (?:in|with|against|between|crimes?|zone|games|dead|footing|effort|aims?|powers|criminals?|-torn)',
      'wartime|warships?|warplanes?|warfare|warlords?|war-torn|at war|go to war|declare[sd]? war|wage[sd]? war',
      '(?<!flood )(?<!coastal )(?<!sea )defen[cs]e(?! attorneys?| lawyers?| counsel| team)|pentagon|nato\\b',
      'weapons?|arms (?:supplies|deals?|sales|race|control|embargo)|fighter jets?|navy|naval|(?<!salvation )army|air force|marines?',
      'terror(?:ism|ist|ists)?|jihadists?|espionage|spy (?:agency|agencies|ring|chief)|hostages?|insurgen\\w+|militants?|militias?|rebels?|gunmen|bombings?|hijack\\w*',
      'security council|peacekeep\\w+|border clash\\w*',
    ]),
  },
  {
    id: 'energy', label: 'Energy & Climate', kind: 'industry',
    re: ci([
      'oil\\b(?! painting| paint)|crude|brent|opec\\+?|\\blng\\b|natural gas|gasoline|petrol|diesel|refiner(?:y|ies)|pipelines?',
      'gas (?:prices?|pipelines?|supply|supplies|exports?|imports?|fields?|bills?|storage|grid|giant|utilit(?:y|ies)|stations?|tax)|gas at the pump',
      'fuel (?:prices?|costs?|tax|supply|shortages?|exports?|subsid\\w+)',
      'energy(?! drinks?)|power (?:grid|plants?|outages?|cuts?|prices?|bills?|demand|supply)|load[- ]shedding|blackouts?|electricity|utilit(?:y|ies) (?:bills?|rates)',
      'climate(?! of fear)|global warming|renewables?|solar|wind (?:power|farms?|turbines?|energy)|offshore wind|nuclear (?:power|plants?|energy|reactors?)|hydrogen|geothermal|fracking|shale|coal\\b',
      'emissions?|carbon|net[- ]zero|decarboni[sz]\\w+|cop\\d{2}|paris agreement|lithium|battery storage',
    ]),
  },
  {
    id: 'ai-technology', label: 'AI & Technology', kind: 'technology',
    re: ci([
      'artificial intelligence|machine learning|large language models?|llms?\\b|chatbots?|generative|openai|anthropic|chatgpt|deepmind|deepseek|nvidia|tsmc|microsoft|google|alphabet|starlink',
      'semiconductors?|chipmakers?|(?<!potato )(?<!tortilla )(?<!corn )chip makers?|microchips?|ai chips?|gpus?\\b|chip (?:stocks?|exports?|design|sales|shortage|supply|production|giant|plant|demand)',
      'software|saas\\b|cyber\\w*|hack(?:ers?|ed|ing)?\\b|data breach(?:es)?|ransomware|malware|big tech|silicon valley',
      'tech (?:giants?|companies|firms|stocks?|industry|sector|layoffs?|workers)',
      'robot(?:s|ics)?\\b|humanoids?|self-driving|autonomous (?:vehicles?|driving|cars?)|quantum|cloud (?:computing|growth|spending|services|providers?|capex)|neoclouds?|data cent(?:er|re)s?',
      'algorithms?|smartphones?|iphone|app store|social media|facebook|instagram|tiktok|samsung',
    ]),
    cs: cs(['A\\.?I\\.?(?!\\w)', 'Apple\\b(?<!Big Apple)(?! pie)', 'Meta\\b', 'Amazon\\b(?!\\s+(?:rainforest|river|basin))', 'Intel\\b', 'AMD\\b']),
  },
  {
    id: 'markets-macro', label: 'Markets & Macro', kind: 'economic',
    re: ci([
      'stocks\\b|equit(?:y|ies) (?:markets?|investors?)|stock (?:markets?|exchanges?|prices?|index|indices)|wall street|s&p 500|nasdaq|dow jones|ftse|nikkei|hang seng|sensex|nifty',
      '(?:global|asian|european|us|financial|emerging|world|bond|credit|equity|currency|money|capital|debt|housing) markets?|markets? (?:rall(?:y|ies)|rout|sell-?off|slump|tumble|jitters|turmoil|wrap|volatility|reaction|brace|shrug|react\\w*|cheer|fret|digest|weigh)',
      'shares (?:of|in|rose|fell|jump(?:ed)?|surge[sd]?|slide[sd]?|slid|drop(?:ped)?|tumble[sd]?|plunge[sd]?|climb(?:ed)?|gain(?:ed)?)|share price',
      'federal reserve|the fed\\b|fomc|central banks?|ecb\\b|rbi\\b|interest rates?|mortgage rates?|policy rates?|repo rate|selic',
      '(?:rate|rates) (?:cuts?|hikes?|holds?|pause|decision|rise|rises|on hold)|(?:cuts?|cutting|hikes?|hiking|raises?|raising|holds?|holding|keeps?|lowers?|slash(?:es)?) (?:key |benchmark |interest |policy |mortgage |lending |repo )rates?\\b|(?:holds?|keeps?|cuts?|hikes?) rates\\b',
      'inflation|disinflation|deflation|gdp|recession|stagflation|economy|economic (?:growth|data|outlook|slowdown|downturn|crisis)|unemployment|jobs report|payrolls|\\bcpi\\b',
      'dollar|currenc(?:y|ies)|forex|(?:treasury|bond|bund|gilt) yields?|yields? (?:rise|fall|climb|jump|spike|slip)|deficit|debt (?:ceiling|crisis|burden|levels?|restructuring)|bondholders?|bond (?:sale|sales|market|investors|traders)|treasury (?:bonds?|bills?|notes?)',
      'peso|yen|naira|rial|rand\\b|lira|rubles?|roubles?|euro\\b|sterling|pound (?:falls?|slides?|rises?|jumps?|slumps?|steadies|weakens?|strengthens?|hits?)|rupee|gold (?:prices?|hits)|commodit(?:y|ies)|hedge funds?|dividend stocks?|borrowing costs|(?:exports?|imports?) (?:drop|fall|fell|rise|rose|surge|slump|jump)\\w*',
    ]),
    cs: cs(['Fed\\b(?!\\s+[Uu]p\\b)']),
  },
  {
    id: 'venture-startups', label: 'Venture & Startups', kind: 'economic',
    re: ci([
      'start-?ups?|scale-?ups?|venture (?:capital|capitalists?|funding|funds?|firms?|-?backed|investors?)|vcs?\\b|series [a-e]\\b(?! of)|seed (?:rounds?|funding|stage|investors?)|pre-seed|funding rounds?|fundrais\\w+|unicorns?|decacorns?|(?:early|late|growth|seed|pre-seed)-stage|funding (?:dries|slows|drops|rebounds|boom|slump|winter)|accelerators?|y combinator|a16z|andreessen|sequoia|general catalyst',
      '(?:raises?|raised|raising|secures?|secured|closes|closed|lands|bags|nets|lands) (?:[£$€]|us\\$)\\s?\\d[\\d.,]*\\s?(?:k|m|mn|million)\\b',
      '[£$€]\\s?\\d[\\d.,]*\\s?(?:m|mn|bn|b|million|billion)\\s+(?:round|seed|series|funding|valuation)',
      'valuation (?:of|at|hits|tops|soars|jumps)|valued at|at (?:a )?[£$€]\\s?\\d[\\d.,]*\\s?(?:m|mn|bn|b|million|billion) valuation|ipo\\b|goes public|go public',
    ]),
  },
  {
    id: 'crypto', label: 'Crypto', kind: 'technology',
    re: ci([
      'bitcoin|btc\\b|crypto\\w*|ethereum|blockchain|stablecoins?|\\bdefi\\b|\\bnfts?\\b|solana|binance|coinbase|altcoins?|memecoins?|web3|digital assets?',
    ]),
  },
  {
    id: 'corporate', label: 'Corporate & M&A', kind: 'economic',
    re: ci([
      'mergers?|acquisitions?|acquires?(?! (?:\\w+ ){0,2}(?:jets?|weapons?|missiles?|fighters?|systems?|aircraft|drones?|citizenship|land|stakes?))|acquired|acquiring|deal rumou?rs|takeovers?|buyouts?|spin-?offs?|bidding war',
      '(?:buys|to buy|agrees to buy|snaps up|to acquire|to sell|sells) .{0,60}?(?:for|at) (?:about |around |nearly )?[£$€]\\s?\\d',
      'earnings|quarterly results|profit (?:warning|falls|rises|jumps|drops|beats?)|profits? (?:beat|miss|fall|rise|slide|slump|plunge|surge|tumble|soar|jump)|revenue (?:rises|falls|jumps|growth|beat|miss|forecast)',
      'ceo\\b|chief executive|chairman|cfo\\b',
      'layoffs?|lays? off|job cuts|redundanc(?:y|ies)|bankruptcy|bankrupt|chapter 11|insolven\\w+|antitrust|monopol(?:y|ies)|share buybacks?|(?:corporate|company|business|cost) restructuring|restructuring (?:plan|charges?|costs?)',
      'settle(?:s|d)? (?:\\w+ )?(?:allegations|claims|lawsuits?|charges|probe|case)|to pay \\$[\\d.,]+ ?(?:million|billion)? to settle|recalls? (?:\\w+ )?(?:vehicles|cars)',
    ]),
  },
  {
    id: 'health', label: 'Global Health', kind: 'policy',
    re: ci([
      'world health organi[sz]ation|outbreaks?|pandemics?|epidemics?|vaccin\\w+|viruses|virus\\b|measles|covid|bird flu|flu shots?|h5n1|ebola|mpox|cholera|dengue|malaria',
      'health (?:care|minister|secretary|system|services?|insurance|crisis|officials|authorities|department)|healthcare|hospitals?|medicare|medicaid|nhs\\b|cdc\\b|fda\\b',
      'drug (?:prices?|pricing|makers?|approval)|pharma\\w*|clinical trials?|patients?|cancer|diseases?|obesity|glp-1|ozempic|contracepti\\w+|abortion|medical|mental health|public health|life expectancy|survival rates?',
    ]),
    cs: cs(['WHO\\b']),
  },
  {
    id: 'courts-law', label: 'Courts & Law', kind: 'policy',
    re: ci([
      'courts?\\b|rulings?\\b(?! (?:party|coalition|bloc|elite|junta|family|regime|government))|verdicts?|indict\\w*|lawsuits?|sues\\b|sued\\b|suing\\b|judges?\\b|jury\\b|tribunal|international criminal court|international court of justice',
      '(?:criminal|murder|corruption|fraud|show|retrial|war crimes) trials?|trials? (?:of|begins|opens|starts|verdict)|stands? trial|on trial',
      'prosecutors? (?:charge|indict|file|seek|drop|appeal|allege|open)\\w*|prosecution|prosecuted|prosecutes|judicial|judiciary|antitrust (?:fines?|rulings?|reviews?|probes?|cases?|suits?)|to settle|settlements?|convict\\w*|acquit\\w*|sentenced?|jailed|imprisoned|life sentence|plead\\w* guilty|charged with|criminal (?:charges|probe|investigation)|faces? charges|extradit\\w+|impeach\\w*|pardons?|class action|litigation|legal (?:challenge|battle|fight)',
      'legislation|legislative|bill (?:passes|passed|signed|clears)|(?:pass|passes|passed|signs|signed|approves|approved|clears|cleared|vetoes|vetoed)\\b.{0,40}?\\b(?:bills?|laws?|legislation)\\b|signs? (?:into )?law|(?:privacy|data|new|upcoming|proposed|landmark|sweeping) laws?|rule(?:s|d)? (?:that|against|in favou?r)|struck down',
    ]),
  },
];

const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

export function topicById(id) {
  return TOPIC_BY_ID.get(id) || null;
}

/** True when `text` belongs to `topic` (case-insensitive plus case-sensitive parts). */
export function topicMatches(topic, text) {
  return topic.re.test(text) || Boolean(topic.cs && topic.cs.test(text));
}

/** Topic IDs for a free-text blob (headline, headline + summary). */
export function topicsForText(text) {
  const s = String(text || '');
  return TOPICS.filter((t) => topicMatches(t, s)).map((t) => t.id);
}

/**
 * Topic IDs matching a cluster. Text is the title plus entities (which come
 * from member summaries too). The bare "united states" entity is dropped
 * because every story that mentions the US would otherwise count as US
 * politics, and event terms are not used: "strike", "drone", "raises" are
 * exactly the ambiguous words the contextual patterns exist to handle.
 */
export function topicsForCluster(cluster) {
  const ents = (cluster.entities || []).filter((e) => e !== 'united states');
  return topicsForText(`${cluster.title} ${ents.join(' ')}`);
}
