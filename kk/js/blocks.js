// Block language: the SPIKE Prime palette on top of scratch-blocks. One table row per block, see CATS.
(function () {
  const RA = window.RA;

  // Russian strings first, SPIKE's exact wording on top. Built-in blocks read these in their init().
  Object.assign(Blockly.Msg, Blockly.ScratchMsgsKk, {
    CONTROL_WAIT: '%1 секунд күту', CONTROL_REPEAT: '%1 рет қайталау', CONTROL_FOREVER: 'үнемі қайталау',
    CONTROL_IF: 'егер %1 , онда', CONTROL_ELSE: 'әйтпесе', CONTROL_WAITUNTIL: '%1 болғанша күту',
    CONTROL_REPEATUNTIL: '%1 болғанша қайталау', OPERATORS_RANDOM: '%1 – %2 аралығынан кездейсоқ сан',
    OPERATORS_JOIN: '%1 %2 біріктіру', OPERATORS_LETTEROF: '%2 ішіндегі № %1 әріп', OPERATORS_LENGTH: '%1 ұзындығы',
    OPERATORS_CONTAINS: '%1 ішінде %2 бар ма?', OPERATORS_ROUND: '%1 дөңгелектеу', OPERATORS_AND: '%1 және %2',
    OPERATORS_OR: '%1 немесе %2', OPERATORS_NOT: '%1 емес', NEW_VARIABLE: 'Айнымалы жасау',
    NEW_LIST: 'Тізім жасау', NEW_PROCEDURE: 'Блок жасау', SOUND_EFFECTS_PAN: 'солға/оңға панорама',
    SOUND_SETVOLUMETO: 'дыбыс деңгейі %1 % болсын', DELETE_X_BLOCKS: '%1 блокты өшіру', DELETE_ALL_BLOCKS: 'Барлық %1 блокты өшіресің бе?', CLEAN_UP: 'Блоктарды реттеу',
    // Scratch's Kazakh that reads wrong in the palette: suffixes glued to slots, typos, wrong words.
    OPERATORS_MOD: '%1 mod %2', OPERATORS_MATHOP: '%1 %2', OPERATORS_MATHOP_FLOOR: 'төмен дөңгелектеу', OPERATORS_MATHOP_CEILING: 'жоғары дөңгелектеу',
    SOUND_EFFECTS_PITCH: 'дыбыс биіктігі', SOUND_CHANGEEFFECTBY: '%1 әсеріне %2 қосу', SOUND_SETEFFECTO: '%1 әсері %2 болсын',
    SOUND_CLEAREFFECTS: 'дыбыс әсерлерін өшіру', SOUND_CHANGEVOLUMEBY: 'дыбыс деңгейіне %1 қосу', SOUND_VOLUME: 'дыбыс деңгейі',
    EVENT_BROADCAST: '%1 хабарын жіберу', EVENT_BROADCASTANDWAIT: '%1 хабарын жіберіп, күту', NEW_BROADCAST_MESSAGE: 'Жаңа хабарлама',
    DATA_SETVARIABLETO: '%1 мәні %2 болсын', DATA_CHANGEVARIABLEBY: '%1 мәніне %2 қосу', DATA_ADDTOLIST: '%2 тізіміне %1 қосу',
    DATA_DELETEOFLIST: '%2 тізімінен № %1 элементті өшіру', DATA_DELETEALLOFLIST: '%1 тізімін түгел өшіру',
    DATA_INSERTATLIST: '%3 тізімінің № %2 орнына %1 қою', DATA_REPLACEITEMOFLIST: '%2 тізімінің № %1 элементі %3 болсын',
    DATA_ITEMOFLIST: '%2 тізімінің № %1 элементі', DATA_ITEMNUMOFLIST: '%2 тізіміндегі %1 нөмірі', DATA_LENGTHOFLIST: '%1 тізімінің ұзындығы',
    DATA_LISTCONTAINSITEM: '%1 тізімінде %2 бар ма?', PROCEDURES_DEFINITION: '%1 блогын анықтау', CATEGORY_VARIABLES: 'Айнымалылар',
    NEW_VARIABLE_TITLE: 'Жаңа айнымалының атауы:', DELETE_VARIABLE_CONFIRMATION: '«%2» айнымалысы %1 жерде қолданылған. Өшіресің бе?',
    PROCEDURE_USED: 'Бұл блокты өшірмес бұрын оны қолданатын блоктардың бәрін өшір.',
  });

  // fill, secondary, stroke per category.
  const COL = {
    motor: ['#0090F5', '#0078CC', '#0062A6'], move: ['#FF4CCD', '#C80090', '#B2248A'],
    light: ['#9B6AF6', '#691FF0', '#571CC1'], sounds: ['#C061F1', '#8A40AF', '#642E7F'],
    events: ['#F5C402', '#C8A300', '#B09400'], control: ['#FFB515', '#ECA100', '#C98A01'],
    sensing: ['#34CCF1', '#00A8C9', '#368FA9'], operators: ['#00B94D', '#00963E', '#006A2A'],
    data: ['#FF8F24', '#FF7D00', '#C76000'], more: ['#FF5D64', '#FF000C', '#C7222A'],
  };

  const svg = (w, h, body) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
  const dots = (c, r, list) => list.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
  const HUB_GRID = [0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].map((j) => [16.2 + j * 5.2, 8.4 + i * 5.2]));

  // Block icons, white shapes in a 48x48 box, outlined with the block's secondary colour.
  const ICONS = {
    motor: (c) => `<circle cx="24" cy="24" r="21" fill="#fff" stroke="${c}" stroke-width="1.5"/>`
      + dots(c, 5.7, [[24, 12], [24, 36], [12, 24], [36, 24]])
      + `<path d="M24 20v8M20 24h8" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
    move: (c) => `<circle cx="17" cy="24" r="14.5" fill="#fff" stroke="${c}" stroke-width="1.5"/>`
      + `<circle cx="31" cy="24" r="14.5" fill="#fff" stroke="${c}" stroke-width="1.5"/>` + dots(c, 5, [[17, 24], [31, 24]]),
    hub: (c) => `<rect x="10" y="2" width="28" height="44" rx="4" fill="#fff" stroke="${c}" stroke-width="1.5"/>`
      + dots(c, 1.9, HUB_GRID) + `<circle cx="24" cy="38.5" r="3" fill="none" stroke="${c}" stroke-width="1.8"/>`,
    colour: (c) => `<rect x="6" y="6" width="36" height="36" rx="5" fill="#fff" stroke="${c}" stroke-width="1.5"/>`
      + `<circle cx="24" cy="24" r="13.5" fill="none" stroke="${c}" stroke-width="2"/>` + dots(c, 9.5, [[24, 24]]),
    force: (c) => `<path d="M9 18H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4M39 18h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4" fill="#fff" stroke="${c}" stroke-width="1.5"/>`
      + `<rect x="9" y="10" width="30" height="28" rx="5" fill="#fff" stroke="${c}" stroke-width="1.5"/>` + dots(c, 9, [[24, 24]])
      + '<path d="M24 19.5v9M19.5 24h9" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
    distance: (c) => `<rect x="2" y="11" width="44" height="26" rx="6" fill="#fff" stroke="${c}" stroke-width="1.5"/>`
      + `<circle cx="14" cy="24" r="7" fill="none" stroke="${c}" stroke-width="3"/><circle cx="34" cy="24" r="7" fill="none" stroke="${c}" stroke-width="3"/>`
      + `<path d="M21 24h6" stroke="${c}" stroke-width="3"/>`,
    play: () => '<path d="M17 13 35 24 17 35z" fill="#fff" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/>',
  };

  // Pictures for direction menus, 24x24, white.
  const ROT = '<path d="M17.4 18A7.6 7.6 0 1 1 11.6 5.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M11 1.6 17.6 5.6 11 9.6z" fill="#fff" stroke="#fff" stroke-linejoin="round"/>';
  const UP = '<path d="M12 3.5 19.5 12H15v8.5H9V12H4.5z" fill="#fff" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>';
  const pic = (body, alt, value) => [{ src: svg(24, 24, body), width: 24, height: 24, alt }, value];
  const turned = (deg) => `<g transform="rotate(${deg} 12 12)">${UP}</g>`;
  const CW = pic(ROT, 'сағат тілімен', 'clockwise');
  const CCW = pic(`<g transform="translate(24 0) scale(-1 1)">${ROT}</g>`, 'сағат тіліне қарсы', 'counterclockwise');

  // Colours are stored as CSS values: the VM hands them to hw.centerLight as they are.
  const swatch = (alt, fill) => [{ src: svg(140, 24, `<circle cx="12" cy="12" r="10" fill="${fill}" stroke="#fff" stroke-width="1.5"/>`
    + `<text x="32" y="17" fill="#fff" font-family="Arial, sans-serif" font-size="14">${alt}</text>`), width: 140, height: 24, alt, fill }, fill];

  const list = (s) => s.split('|').map((o) => { const i = o.lastIndexOf('='); return [o.slice(0, i), o.slice(i + 1)]; });
  const steerings = [];
  for (let v = -100; v <= 100; v += 10) steerings.push([(v < 0 ? 'солға: ' + -v : v ? 'оңға: ' + v : 'тура: 0'), String(v)]);
  const pairs = [];
  [...'ABCDE'].forEach((a, i) => [...'ABCDEF'].slice(i + 1).forEach((b) => pairs.push([a + '+' + b, a + b])));

  const MENUS = {
    'multiple-port': [...'ABCDEF'].map((p) => [p, p]),
    rotation: [CW, CCW],
    turn: list('айналым=rotations|градус=degrees|секунд=seconds'),
    path: list('ең қысқа жолмен=shortest|сағат тілімен=clockwise|сағат тіліне қарсы=counterclockwise'),
    drive: [pic(UP, 'алға', 'forward'), pic(turned(180), 'артқа', 'backward'), CW, CCW],
    travel: list('айналым=rotations|градус=degrees|секунд=seconds|см=cm|дюйм=inches'),
    length: list('см=cm|дюйм=inches'),
    steering: steerings, pair: pairs,
    orientation: list('тік=upright|солға=left|оңға=right|төңкерілген=upsidedown'),
    colour: [swatch('қызыл', '#FF0000'), swatch('қызғылт сары', '#FF8A00'), swatch('сары', '#FFE100'), swatch('жасыл', '#00C040'),
      swatch('көгілдір', '#25C7F7'), swatch('көк', '#0050FF'), swatch('күлгін', '#A030FF'), swatch('ақ', '#FFFFFF'), swatch('қара', '#000000')],
    eyes: list('○ ○=0 0|● ○=100 0|○ ●=0 100|● ●=100 100'),
    sound: list('Cat Meow 1=Cat Meow 1|Dog Bark 1=Dog Bark 1|Laser=Laser|Hello=Hello|Applause=Applause'),
    force: list('басылған=pressed|қатты басылған=hardpressed|жіберілген=released|қысымы өзгерген=changed'),
    near: list('жақынырақ=closer|алысырақ=farther'),
    distance: list('%=percent|см=cm|дюйм=inches'),
    tilt: [pic(UP, 'алға', 'forward'), pic(turned(180), 'артқа', 'backward'), pic(turned(270), 'солға', 'left'), pic(turned(90), 'оңға', 'right')],
    side: list('алдыңғы жағы=front|артқы жағы=back|үсті=top|асты=bottom|сол жағы=leftside|оң жағы=rightside'),
    gesture: list('сілку=shake|түрту=tap|екі рет түрту=doubletap|құлау=fall'),
    button: list('сол жақ=left|оң жақ=right'),
    press: list('басылған=pressed|жіберілген=released'),
    stop: list('бәрін=all|бағдарламаны=exit|осы ішкі бағдарламаны=this'),
    compare: list('<=lt|>=gt|==eq'),
    newton: list('%=percent|Н=newton'),
    axis: list('еңкею=pitch|қисаю=roll|бұрылу=yaw'),
  };

  const SMILE = '0101001010000001000101110';
  const FIELD_OF = { math_number: 'NUM', math_positive_number: 'NUM', math_whole_number: 'NUM', text: 'TEXT', note: 'NOTE', matrix: 'MATRIX' };

  // Round "menu" shadows: same options, one type per category because the pill takes the category's colour.
  const menuType = (cat, key) => {
    const type = `flipper${cat}_${key}-selector`;
    const c = COL[cat];
    const options = MENUS[key];
    Blockly.Blocks[type] = Blockly.Blocks[type] || {
      init() {
        this.jsonInit({ message0: '%1', args0: [{ type: fieldType(options), name: 'field_' + type, options }],
          colour: c[1], colourSecondary: c[1], colourTertiary: c[2], colourQuaternary: c[2], extensions: ['output_string'] });
      },
    };
    return type;
  };
  const fieldType = (options) => (typeof options[0][0] === 'object' ? 'field_icondropdown' : 'field_dropdown');

  // Template to Blockly JSON plus the shadows for the toolbox: (NAME:1) number, (NAME:'a') text, (NAME@type:v) any shadow,
  // [NAME:menu=default] round menu, {NAME:menu} rectangular dropdown, <NAME> boolean slot, (PORT) the port menu.
  function parse(tpl, cat, first) {
    const args = [];
    let xml = '';
    const message = tpl.replace(/\(PORT\)/g, '[PORT:multiple-port]').split(/(\([^)]*\)|\{[^}]*\}|\[[^\]]*\]|<[^<>]+>)/).map((part, i) => {
      if (i % 2 === 0) return part.replace(/%/g, '%%');
      const body = part.slice(1, -1);
      if (part[0] === '{') {
        const [name, key] = body.split(':');
        args.push({ type: fieldType(MENUS[key]), name, options: MENUS[key] });
      } else if (part[0] === '<') {
        args.push({ type: 'input_value', name: body, check: 'Boolean' });
      } else if (part[0] === '[') {
        const [, name, key, value] = /^(\w+):([\w-]+)(?:=(.*))?$/.exec(body);
        const type = menuType(cat, key);
        args.push({ type: 'input_value', name });
        xml += `<value name="${name}"><shadow type="${type}">${value ? `<field name="field_${type}">${value}</field>` : ''}</shadow></value>`;
      } else {
        const [, name, kind, raw = ''] = /^(\w+)(?:@(\w+))?(?::(.*))?$/.exec(body);
        const quoted = raw[0] === "'";
        const type = kind || (quoted ? 'text' : 'math_number');
        const field = FIELD_OF[type] ? `<field name="${FIELD_OF[type]}">${quoted ? raw.slice(1, -1) : raw}</field>` : '';
        args.push({ type: 'input_value', name });
        xml += `<value name="${name}"><shadow type="${type}">${field}</shadow></value>`;
      }
      return '%' + (first + args.length);
    }).join('');
    return { message, args, xml };
  }

  const SHAPE = { stack: 'shape_statement', hat: 'shape_hat', round: 'output_number', bool: 'output_boolean' };

  // Registers a block unless scratch-blocks already has it, and returns its toolbox XML.
  function block([type, tpl, shape = 'stack', icon], cat) {
    const c = COL[cat];
    const head = icon ? [{ type: 'field_image', src: svg(48, 48, ICONS[icon](c[1])), width: 40, height: 40, alt: '' }, { type: 'field_vertical_separator' }] : [];
    const { message, args, xml } = parse(tpl, cat, head.length);
    Blockly.Blocks[type] = Blockly.Blocks[type] || {
      init() {
        this.jsonInit({ message0: (icon ? '%1 %2 ' : '') + message, args0: head.concat(args), category: cat,
          colour: c[0], colourSecondary: c[1], colourTertiary: c[2], colourQuaternary: c[2],
          extensions: [SHAPE[shape]].concat(icon ? ['scratch_extension'] : []) });
      },
    };
    return `<block type="${type}">${xml}</block>`;
  }

  // Rows: [type, template, shape, icon]. A number is the gap to the next row. Toolbox order is the SPIKE order.
  const m = (type, tpl, shape) => [type, tpl, shape, 'motor'];
  const h = (type, tpl, shape) => [type, tpl, shape, 'hub'];
  const CATS = [
    ['motor', 'Моторлар', 'motor', [
      m('flippermotor_motorTurnForDirection', '(PORT) {DIRECTION:rotation} (VALUE:1) {UNIT:turn} айналдыру'),
      m('flippermotor_motorGoDirectionToPosition', '(PORT) {DIRECTION:path} (POSITION:0) позициясына бару'),
      m('flippermotor_motorStartDirection', '(PORT) моторды {DIRECTION:rotation} іске қосу'),
      m('flippermotor_motorStop', '(PORT) моторды тоқтату'), 28,
      m('flippermotor_motorSetSpeed', '(PORT) жылдамдығы (SPEED:75) % болсын'), 28,
      m('flippermotor_absolutePosition', '(PORT) позициясы', 'round'),
      m('flippermotor_speed', '(PORT) жылдамдығы', 'round'),
    ]],
    ['move', 'Қозғалыс', 'move', [
      ['flippermove_move', '{DIRECTION:drive} (VALUE:10) {UNIT:travel} жылжу', 'stack', 'move'],
      ['flippermove_startMove', '{DIRECTION:drive} қозғала бастау', 'stack', 'move'],
      ['flippermove_steer', '[STEERING:steering=30] (VALUE:10) {UNIT:travel} жылжу', 'stack', 'move'],
      ['flippermove_startSteer', '[STEERING:steering=30] қозғала бастау', 'stack', 'move'],
      ['flippermove_stopMove', 'қозғалысты тоқтату', 'stack', 'move'], 28,
      ['flippermove_movementSpeed', 'қозғалыс жылдамдығы (SPEED:50) % болсын', 'stack', 'move'],
      ['flippermove_setMovementPair', 'қозғалыс моторлары [PAIR:pair] болсын', 'stack', 'move'],
      ['flippermove_setDistance', 'мотордың бір айналымы (DISTANCE:17.5) {UNIT:length} болсын', 'stack', 'move'],
    ]],
    ['light', 'Жарық', 'light', [
      h('flipperlight_lightDisplayImageOnForTime', `(MATRIX@matrix:${SMILE}) (VALUE:2) секунд көрсету`),
      h('flipperlight_lightDisplayImageOn', `(MATRIX@matrix:${SMILE}) көрсету`),
      h('flipperlight_lightDisplayText', "(TEXT:'Hello') жазу"),
      h('flipperlight_lightDisplayOff', 'пиксельдерді өшіру'), 28,
      h('flipperlight_lightDisplaySetBrightness', 'пиксель жарықтығы (BRIGHTNESS:75) % болсын'),
      h('flipperlight_lightDisplaySetPixel', '(X:1) , (Y:1) пикселі (BRIGHTNESS:100) % болсын'),
      h('flipperlight_lightDisplayRotate', '{DIRECTION:rotation} бұру'),
      h('flipperlight_lightDisplaySetOrientation', 'экран бағдары [ORIENTATION:orientation] болсын'), 28,
      h('flipperlight_centerButtonLight', 'ортаңғы батырма жарығы [COLOR:colour] болсын'),
      ['flipperlight_ultrasonicLightUp', '(PORT) шамдарын [VALUE:eyes] жағу', 'stack', 'distance'],
    ]],
    ['sounds', 'Дыбыс', 'sounds', [
      ['flippersound_playSoundUntilDone', '[SOUND:sound] дыбысын соңына дейін ойнату'],
      ['flippersound_playSound', '[SOUND:sound] дыбысын ойнату'],
      h('flippersound_beepForTime', '(NOTE@note:60) нотасымен (DURATION:0.2) секунд сигнал беру'),
      h('flippersound_beep', '(NOTE@note:60) нотасымен сигнал қосу'),
      ['flippersound_stopSound', 'барлық дыбысты тоқтату'], 28,
      ['sound_changeeffectby', '(VALUE:10)'], ['sound_seteffectto', '(VALUE:100)'], ['sound_cleareffects', ''], 28,
      ['sound_changevolumeby', '(VOLUME:-10)'], ['sound_setvolumeto', '(VOLUME:100)'], ['sound_volume', ''],
    ]],
    ['events', 'Оқиғалар', 'events', [
      ['flipperevents_whenProgramStarts', 'бағдарлама іске қосылғанда', 'hat', 'play'], 28,
      ['flipperevents_whenColor', '(PORT) түсі [OPTION:colour] болғанда', 'hat', 'colour'],
      ['flipperevents_whenPressed', '[PORT:multiple-port=E] {OPTION:force} кезде', 'hat', 'force'],
      ['flipperevents_whenDistance', '(PORT) {COMPARATOR:near} (VALUE:8) {UNIT:distance} болғанда', 'hat', 'distance'], 28,
      h('flipperevents_whenTilted', '[VALUE:tilt] еңкейгенде', 'hat'),
      h('flipperevents_whenOrientation', '{VALUE:side} жоғары болғанда', 'hat'),
      h('flipperevents_whenGesture', '{EVENT:gesture} болғанда', 'hat'),
      h('flipperevents_whenButton', '{BUTTON:button} батырма {EVENT:press} кезде', 'hat'), 28,
      ['flipperevents_whenTimer', 'таймер > (VALUE:10) болғанда', 'hat'], 28,
      ['flipperevents_whenCondition', '<CONDITION> болғанда', 'hat'], 28,
      ['event_whenbroadcastreceived', ''],
      ['event_broadcast', '(BROADCAST_INPUT@event_broadcast_menu)'],
      ['event_broadcastandwait', '(BROADCAST_INPUT@event_broadcast_menu)'],
    ]],
    ['control', 'Басқару', 'control', [
      ['control_wait', '(DURATION@math_positive_number:1)'],
      ['control_repeat', '(TIMES@math_whole_number:10)'], ['control_forever', ''], 28,
      ['control_if', ''], ['control_if_else', ''], ['control_wait_until', ''], ['control_repeat_until', ''], 28,
      ['flippercontrol_stopOtherStacks', 'басқа ішкі бағдарламаларды тоқтату'],
      ['flippercontrol_stop', '{STOP_OPTION:stop} тоқтату'],
    ]],
    ['sensing', 'Датчиктер', 'sensing', [
      ['flippersensors_isColor', '(PORT) түсі [VALUE:colour] ?', 'bool', 'colour'],
      ['flippersensors_color', '(PORT) түсі', 'round', 'colour'],
      ['flippersensors_isReflectivity', '(PORT) шағылған жарығы {COMPARATOR:compare} (VALUE:50) %?', 'bool', 'colour'],
      ['flippersensors_reflectivity', '(PORT) шағылған жарығы', 'round', 'colour'], 28,
      ['flippersensors_isPressed', '[PORT:multiple-port=E] — {OPTION:force} ?', 'bool', 'force'],
      ['flippersensors_force', '[PORT:multiple-port=E] қысымы, {UNIT:newton}', 'round', 'force'], 28,
      ['flippersensors_isDistance', '(PORT) — {COMPARATOR:near} (VALUE:15) {UNIT:distance} ?', 'bool', 'distance'],
      ['flippersensors_distance', '(PORT) қашықтығы, {UNIT:distance}', 'round', 'distance'], 28,
      h('flippersensors_isTilted', 'хаб [VALUE:tilt] еңкейген бе?', 'bool'),
      h('flippersensors_isorientation', '{VALUE:side} жоғары ма?', 'bool'),
      h('flippersensors_ismotion', '{EVENT:gesture} болды ма?', 'bool'),
      h('flippersensors_orientationAxis', '{AXIS:axis} бұрышы', 'round'),
      h('flippersensors_resetYaw', 'хабтың бұрылу бұрышы 0 болсын'),
      h('flippersensors_buttonIsPressed', '{BUTTON:button} батырма {EVENT:press} ?', 'bool'), 28,
      ['flippersensors_timer', 'таймер', 'round'], ['flippersensors_resetTimer', 'таймерді нөлдеу'],
    ]],
    ['operators', 'Операторлар', 'operators', [
      ['operator_random', '(FROM:1)(TO:10)'], 28,
      ['operator_add', '(NUM1:)(NUM2:)'], ['operator_subtract', '(NUM1:)(NUM2:)'],
      ['operator_multiply', '(NUM1:)(NUM2:)'], ['operator_divide', '(NUM1:)(NUM2:)'], 28,
      ['operator_lt', "(OPERAND1:'')(OPERAND2:'100')"], ['operator_equals', "(OPERAND1:'')(OPERAND2:'100')"],
      ['operator_gt', "(OPERAND1:'')(OPERAND2:'100')"], 28,
      ['operator_and', ''], ['operator_or', ''], ['operator_not', ''], 28,
      ['flipperoperator_isInBetween', '(VALUE:0) мәні (LOW:-10) және (HIGH:10) аралығында ма?', 'bool'], 28,
      ['operator_join', "(STRING1:'apple')(STRING2:'banana')"], ['operator_letter_of', "(LETTER@math_whole_number:1)(STRING:'apple')"],
      ['operator_length', "(STRING:'apple')"], ['operator_contains', "(STRING1:'apple')(STRING2:'a')"], 28,
      ['operator_mod', '(NUM1:)(NUM2:)'], ['operator_round', '(NUM:)'], ['operator_mathop', '(NUM:)'],
    ]],
    ['data', 'Айнымалылар', 'data', 'VARIABLE'],
    ['myblocks', 'Менің блоктарым', 'more', 'PROCEDURE'],
    ['moremotor', 'Қосымша моторлар', 'motor', [
      m('flippermoremotor_motorStartPower', '(PORT) моторды (POWER:100) % қуатпен іске қосу'),
      m('flippermoremotor_power', '(PORT) қуаты', 'round'),
      m('flippermoremotor_position', '(PORT) салыстырмалы позициясы', 'round'),
      m('flippermoremotor_motorSetDegreeCounted', '(PORT) салыстырмалы позициясы (VALUE:0) болсын'),
    ]],
  ];

  const TOOLBOX = '<xml>' + CATS.map(([id, name, colour, rows]) => {
    const c = COL[colour];
    const open = `<category name="${name}" id="${id}" colour="${c[0]}" secondaryColour="${c[1]}"`;
    if (typeof rows === 'string') return `${open} custom="${rows}"></category>`;
    return `${open}>${rows.map((r) => (typeof r === 'number' ? `<sep gap="${r}"></sep>` : block(r, colour))).join('')}</category>`;
  }).join('') + '</xml>';

  // Stage-monitor blocks make no sense on a robot; DataCategory skips the blocks that do not exist.
  ['data_showvariable', 'data_hidevariable', 'data_showlist', 'data_hidelist'].forEach((t) => delete Blockly.Blocks[t]);
  // Same for the flyout's monitor checkboxes.
  Blockly.Block.prototype.hasCheckboxInFlyout = () => false;

  Blockly.Blocks.matrix = {
    init() {
      const c = COL.light;
      this.jsonInit({ message0: '%1', args0: [{ type: 'field_matrix', name: 'MATRIX' }], output: 'Number', outputShape: Blockly.OUTPUT_SHAPE_ROUND,
        colour: c[0], colourSecondary: c[1], colourTertiary: c[2], colourQuaternary: c[2] });
    },
  };

  // scratch-blocks draws a dropdown's picture only inside the open menu. This one puts it on the block too.
  // An option with `fill` paints the whole round shadow instead, that is the colour pill.
  function IconField(options) { Blockly.FieldDropdown.call(this, options); }
  IconField.prototype = Object.create(Blockly.FieldDropdown.prototype);
  IconField.prototype.constructor = IconField;
  IconField.prototype.init = function () {
    if (this.fieldGroup_) return;
    Blockly.FieldDropdown.prototype.init.call(this);
    this.textElement_.style.display = 'none';
    this.image_ = Blockly.utils.createSvgElement('image', { y: 4, width: 24, height: 24 }, this.fieldGroup_);
  };
  IconField.prototype.updateWidth = function () {
    const width = 24 + Blockly.BlockSvg.EDITABLE_FIELD_PADDING;
    this.arrowWidth_ = this.positionArrow(width);
    this.size_.width = width + this.arrowWidth_ + (this.box_ ? 2 * Blockly.BlockSvg.BOX_FIELD_PADDING : 0);
  };
  IconField.prototype.render_ = function () {
    Blockly.FieldDropdown.prototype.render_.call(this);
    const o = this.imageJson_;
    if (!this.image_ || !o) return;
    const href = (el, url) => el.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
    if (o.fill) {
      this.disableColourChange_ = true;
      this.sourceBlock_.setShadowColour(o.fill);
      Blockly.utils.addClass(this.sourceBlock_.getSvgRoot(), 'raSwatch');
      href(this.arrow_, Blockly.mainWorkspace.options.pathToMedia + (o.fill === '#FFFFFF' ? 'dropdown-arrow-dark.svg' : 'dropdown-arrow.svg'));
    } else {
      this.image_.setAttribute('x', (this.size_.width - this.arrowWidth_) / 2 - 12);
      href(this.image_, o.src);
    }
  };
  Blockly.Field.register('field_icondropdown', { fromJson: (o) => new IconField(o.options) });

  // SPIKE's open menus use the dark stroke colour, not the block colour. The piano passes a white stroke, keep its fill there.
  const setColour = Blockly.DropDownDiv.setColour;
  Blockly.DropDownDiv.setColour = (fill, stroke) => { const c = /^#f{6}$/i.test(stroke) ? fill : stroke; setColour(c, c); };

  // Native dialogs are refused on the published page, so everything goes through one <dialog>.
  function dialog({ title, text, value, cancel }, done) {
    const d = document.createElement('dialog');
    d.className = 'raDialog';
    d.innerHTML = `<form method="dialog"><h3></h3><label><span></span>${value === undefined ? '' : '<input maxlength="40" autocomplete="off">'}</label>`
      + `<div class="raDialog__row">${cancel ? '<button class="btn" type="button">Бас тарту</button>' : ''}<button class="btn btn--primary" value="ok">Жарайды</button></div></form>`;
    d.querySelector('h3').textContent = title;
    d.querySelector('span').textContent = text;
    const input = d.querySelector('input');
    if (input) input.value = value;
    // Decide in the click itself: the close event comes later as its own task, and a busy page can run a click on Play first.
    let over = false;
    const finish = (ok) => {
      if (over) return;
      over = true;
      d.close();
      d.remove();
      document.activeElement.blur();
      done(ok, input && input.value);
    };
    // Only ОК is a submit button, so Enter in the name field confirms.
    d.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); finish(true); });
    if (cancel) d.querySelector('[type=button]').onclick = () => finish(false);
    d.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
    d.addEventListener('close', () => finish(false));
    document.body.append(d);
    d.showModal();
    if (input) input.select();
  }
  Blockly.alert = (text, cb) => dialog({ title: 'Қармауыштар', text }, () => { if (cb) cb(); });
  Blockly.confirm = (text, cb) => dialog({ title: 'Қармауыштар', text, cancel: true }, (ok) => cb(ok));
  Blockly.prompt = (text, value, cb, title) => dialog({ title: title || 'Қармауыштар', text, value, cancel: true }, (ok, v) => cb(ok ? v : null));
  // scratch-blocks also calls a bare alert() in two places, e.g. on deleting a used custom block.
  window.alert = (text) => Blockly.alert(text);

  Blockly.Procedures.externalProcedureDefCallback = (mutation, cb) => {
    const ws = Blockly.getMainWorkspace();
    const old = mutation.getAttribute('proccode');
    const isNew = !Blockly.Procedures.getDefineBlock(old, ws);
    const box = ws.getBlocksBoundingBox();
    dialog({ title: 'Менің блогым', text: 'Блокты қалай атаймыз?', value: old, cancel: true }, (ok, name) => {
      // % starts an argument in a proccode, and blocks here take no arguments.
      name = ok ? name.replace(/%/g, '').trim() : '';
      if (name) mutation.setAttribute('proccode', name);
      cb(name ? mutation : null);
      if (!name || !isNew) return;
      // Blockly drops a new definition in the top-left corner, right under the starter's notes.
      const def = Blockly.Procedures.getDefineBlock(name, ws);
      const at = def.getRelativeToSurfaceXY();
      def.moveBy(box.x - at.x, box.y + box.height + 60 - at.y);
      ws.centerOnBlock(def.id);
    });
  };

  // The task programs. LEGO's program for this model: motor A closes to 345 counterclockwise and opens to 25 by the shortest path.
  const port = (cat, p) => `<value name="PORT"><shadow type="flipper${cat}_multiple-port-selector"><field name="field_flipper${cat}_multiple-port-selector">${p}</field></shadow></value>`;
  const num = (name, v) => `<value name="${name}"><shadow type="math_number"><field name="NUM">${v}</field></shadow></value>`;
  // Each piece is one block; chain() nests every next one into the <next> of the one before.
  const chain = (...xs) => xs.reduceRight((next, x) => (next ? x.replace(/<\/block>$/, `<next>${next}</next></block>`) : x), '');
  const goTo = (dir, deg) => `<block type="flippermotor_motorGoDirectionToPosition"><field name="DIRECTION">${dir}</field>${port('motor', 'A')}${num('POSITION', deg)}</block>`;
  const OPEN = goTo('shortest', 25), CLOSE = goTo('counterclockwise', 345);
  const isE = (what) => `<block type="flippersensors_isPressed">${port('sensing', 'E')}<field name="OPTION">${what}</field></block>`;
  const waitE = (what) => `<block type="control_wait_until"><value name="CONDITION">${isE(what)}</value></block>`;
  const forever = (...body) => `<block type="control_forever"><statement name="SUBSTACK">${chain(...body)}</statement></block>`;
  const asHard = '<block type="flippermoremotor_motorStartPower">' + port('motor', 'A') + '<value name="POWER"><shadow type="math_number"><field name="NUM">100</field></shadow>'
    + `<block type="operator_multiply"><value name="NUM1"><shadow type="math_number"><field name="NUM"></field></shadow><block type="flippersensors_force">${port('sensing', 'E')}<field name="UNIT">percent</field></block></value>`
    + `${num('NUM2', -1)}</block></value></block>`;
  const gentle = `<block type="control_if_else"><value name="CONDITION">${isE('pressed')}</value><statement name="SUBSTACK">${asHard}</statement><statement name="SUBSTACK2">${OPEN}</statement></block>`;
  const note = (text) => `<comment pinned="true" w="440" h="100" x="48" y="10" minimized="false">${text}</comment>`;
  const program = (text, ...loop) => `<xml>${chain(`<block type="flipperevents_whenProgramStarts" x="48" y="${text ? 130 : 48}">${text ? note(text) : ''}</block>`, OPEN, forever(...loop))}</xml>`;
  RA.STARTER_XML = program('Датчикті бассаң, қармауыш жабылады. Жіберсең, ашылуы керек, бірақ ашатын блок жоқ. Оны циклдің соңына қос!',
    waitE('pressed'), CLOSE, waitE('released'));
  RA.SOLUTION_XML = program('', waitE('pressed'), CLOSE, waitE('released'), OPEN);
  RA.GENTLE_XML = program('', gentle);
  RA.TOGGLE_XML = program('', waitE('pressed'), CLOSE, waitE('released'), waitE('pressed'), OPEN, waitE('released'));

  // A slimmer sticky note, the left panel has no height to spare.
  Object.assign(Blockly.ScratchBubble, { TOP_BAR_HEIGHT: 20, MINIMIZE_ICON_SIZE: 20, DELETE_ICON_SIZE: 20 });
  Blockly.ScratchBlockComment.TEXTAREA_OFFSET = 8;

  const four = (c) => ({ primary: c[0], secondary: c[1], tertiary: c[2], quaternary: c[2] });

  RA.createBlocks = (container, o) => {
    o = o || {};
    // A phone keeps some workspace next to the palette.
    Blockly.VerticalFlyout.prototype.DEFAULT_WIDTH = container.clientWidth < 600 ? 170 : 274;
    Blockly.Toolbox.prototype.width = 64 + Blockly.VerticalFlyout.prototype.DEFAULT_WIDTH;
    const workspace = Blockly.inject(container, {
      media: o.media || '../vendor/media/', toolbox: TOOLBOX, sounds: false, comments: false, trashcan: false, collapse: false, scrollbars: true,
      zoom: { controls: false, wheel: true, startScale: container.clientWidth < 600 ? 0.65 : 0.8 },
      grid: { spacing: 40, length: 2, colour: '#D9D9D9' },
      colours: {
        workspace: '#FFFFFF', flyout: '#FFFFFF', toolbox: '#FFFFFF', toolboxSelected: '#F2F2F2', scrollbar: '#CECDCE', scrollbarHover: '#CECDCE',
        insertionMarker: '#000000', insertionMarkerOpacity: 0.2, fieldShadow: 'rgba(255,255,255,.3)', dragShadowOpacity: 0.6,
        sounds: four(COL.sounds), event: four(COL.events), control: four(COL.control), sensing: four(COL.sensing),
        operators: four(COL.operators), data: four(COL.data), data_lists: four(COL.data), more: four(COL.more),
      },
    });
    workspace.cleanUp = function () { let y = 130; this.getTopBlocks(true).forEach((b) => { const at = b.getRelativeToSurfaceXY(); b.moveBy(48 - at.x, y - at.y); y += b.getHeightWidth().height + 140; }); };
    workspace.toolbox_.categoryMenu_.categories_.forEach((c) => {
      c.item_.tabIndex = 0;
      c.item_.setAttribute('role', 'button');
      c.item_.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); workspace.toolbox_.setSelectedItem(c); }
      });
    });
    // The long names wrap in the narrow column: one-word names at this hyphen, two-word names at the space.
    [[7, 'Опера\u00ADторлар'], [8, 'Айныма\u00ADлылар'], [9, 'Менің блоктарым']].forEach(([i, name]) => {
      const label = workspace.toolbox_.categoryMenu_.categories_[i].label_;
      label.textContent = name;
      label.style.whiteSpace = 'normal';
    });
    // scratch-gui refreshes the palette after custom-block changes, here it is on us.
    let procs = '';
    const syncPalette = () => {
      const now = Blockly.Procedures.allProcedureMutations(workspace).map((m) => m.getAttribute('proccode')).join('\n');
      if (now === procs) return;
      procs = now;
      workspace.toolbox_.refreshSelection();
    };
    workspace.addChangeListener((e) => {
      if (e.type === Blockly.Events.UI) return;
      syncPalette();
      if (o.onChange) o.onChange(e);
    });

    const load = (xml) => {
      const dom = Blockly.Xml.textToDom(xml);
      Blockly.Events.disable();
      try {
        workspace.clear();
        Blockly.Xml.domToWorkspace(dom, workspace);
      } finally { Blockly.Events.enable(); }
      workspace.clearUndo();
      const m = workspace.getMetrics();
      workspace.scrollbar.set(-m.contentLeft, -m.contentTop);
      syncPalette();
      // After the XML loader's 1 ms timer that opens the notes: a save before it would store them closed.
      if (o.onChange) setTimeout(o.onChange, 10);
    };
    return {
      workspace, load,
      save: () => Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace)),
      reset: () => load(RA.STARTER_XML),
    };
  };
})();
