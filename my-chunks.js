// マイ単語（ユーザーが追加した句動詞）用のチャンクデータ。キーは句動詞名（小文字、*Nなし）。
// chunk: 出題する英語のかたまり / ja: その日本語訳（正解）/ wrong: 逆方向の4択の不正解3つ
// マイ単語は端末ごとのデータなので、番号ではなく句動詞名で対応づける。
const MY_CHUNK_DATA = {
 "pay into": {
  "chunk": "pay into a pension fund",
  "ja": "年金基金に払い込む",
  "wrong": [
   "年金基金から引き出す",
   "年金基金を解約する",
   "年金基金を立ち上げる"
  ],
  "wrongEn": [
   "take money out of a pension fund",
   "cancel a pension fund",
   "set up a pension fund"
  ]
 },
 "go off of": {
  "chunk": "go off of rumors",
  "ja": "うわさに基づいて判断する",
  "wrong": [
   "うわさを聞き流す",
   "うわさを広める",
   "うわさに反論する"
  ],
  "wrongEn": [
   "brush off rumors",
   "pass on rumors",
   "push back against rumors"
  ]
 },
 "get down": {
  "chunk": "get down from the chair",
  "ja": "椅子から降りる",
  "wrong": [
   "椅子に座る",
   "椅子を持ち上げる",
   "椅子を片づける"
  ],
  "wrongEn": [
   "sit down on the chair",
   "pick up the chair",
   "put away the chair"
  ]
 },
 "fall out": {
  "chunk": "hair falls out",
  "ja": "髪が抜け落ちる",
  "wrong": [
   "髪が伸びる",
   "髪を切り落とす",
   "髪を整える"
  ],
  "wrongEn": [
   "hair grows out",
   "cut off hair",
   "tidy up hair"
  ]
 },
 "ride on": {
  "chunk": "ride on the carousel",
  "ja": "メリーゴーラウンドに乗る",
  "wrong": [
   "メリーゴーラウンドから降りる",
   "メリーゴーラウンドを修理する",
   "メリーゴーラウンドを見て回る"
  ],
  "wrongEn": [
   "get off the carousel",
   "fix up the carousel",
   "look around the carousel"
  ]
 },
 "tear down": {
  "chunk": "tear down an old building",
  "ja": "古い建物を取り壊す",
  "wrong": [
   "古い建物を建てる",
   "古い建物を改装する",
   "古い建物に入る"
  ],
  "wrongEn": [
   "put up an old building",
   "fix up an old building",
   "go into an old building"
  ]
 },
 "call for": {
  "chunk": "call for immediate action",
  "ja": "すぐの対応を求める",
  "wrong": [
   "すぐの対応を取り消す",
   "すぐの対応を延期する",
   "すぐの対応を引き受ける"
  ],
  "wrongEn": [
   "call off immediate action",
   "put off immediate action",
   "take on immediate action"
  ]
 },
 "arrive at": {
  "chunk": "arrive at the airport",
  "ja": "空港に到着する",
  "wrong": [
   "空港を出発する",
   "空港で乗り換える",
   "空港に立ち寄る"
  ],
  "wrongEn": [
   "leave the airport",
   "change planes at the airport",
   "stop by the airport"
  ]
 },
 "make sure": {
  "chunk": "make sure the door is locked",
  "ja": "ドアに鍵がかかっているか確認する",
  "wrong": [
   "ドアに鍵をかけ忘れる",
   "ドアを壊して入る",
   "ドアの鍵を紛失する"
  ],
  "wrongEn": [
   "forget to lock the door",
   "break in through the door",
   "lose the door key"
  ]
 },
 "go down": {
  "chunk": "the temperature goes down",
  "ja": "気温が下がる",
  "wrong": [
   "気温が上がる",
   "気温が乱高下する",
   "気温が据え置かれる"
  ],
  "wrongEn": [
   "the temperature goes up",
   "the temperature swings up and down",
   "the temperature holds steady"
  ]
 },
 "level with": {
  "chunk": "level with you",
  "ja": "あなたに率直に話す",
  "wrong": [
   "あなたに嘘をつく",
   "あなたに同意する",
   "あなたを見下す"
  ],
  "wrongEn": [
   "lie to you",
   "go along with you",
   "look down on you"
  ]
 },
 "take up with": {
  "chunk": "take up with a new group",
  "ja": "新しい仲間と付き合い始める",
  "wrong": [
   "新しい仲間と別れる",
   "新しい仲間を追い出す",
   "新しい仲間を見下す"
  ],
  "wrongEn": [
   "break up with a new group",
   "kick out a new group",
   "look down on a new group"
  ]
 },
 "bathe in": {
  "chunk": "bathe in golden sunlight",
  "ja": "黄金色の日差しに包まれる",
  "wrong": [
   "黄金色の日差しを遮る",
   "黄金色の日差しから逃れる",
   "黄金色の日差しを反射する"
  ],
  "wrongEn": [
   "block out the golden sunlight",
   "get away from the golden sunlight",
   "reflect the golden sunlight"
  ]
 },
 "extend to": {
  "chunk": "extend to the mountain peak",
  "ja": "山頂まで延びている",
  "wrong": [
   "山頂から離れていく",
   "山頂を避けて通る",
   "山頂で引き返す"
  ],
  "wrongEn": [
   "move away from the mountain peak",
   "go around the mountain peak",
   "turn back at the mountain peak"
  ]
 },
 "report to": {
  "chunk": "report to my manager",
  "ja": "上司に報告する",
  "wrong": [
   "上司に逆らう",
   "上司を見送る",
   "上司に仕返しする"
  ],
  "wrongEn": [
   "go against my manager",
   "see off my manager",
   "get back at my manager"
  ]
 },
 "hunt out": {
  "chunk": "hunt out an old photo album",
  "ja": "古いアルバムを探し出す",
  "wrong": [
   "古いアルバムを処分する",
   "古いアルバムを片づける",
   "古いアルバムを貸し出す"
  ],
  "wrongEn": [
   "throw out an old photo album",
   "put away an old photo album",
   "lend out an old photo album"
  ]
 },
 "drag into": {
  "chunk": "drag me into the party",
  "ja": "私を無理やりパーティーに引き込む",
  "wrong": [
   "私をパーティーから連れ出す",
   "私をパーティーに誘う",
   "私をパーティーから遠ざける"
  ],
  "wrongEn": [
   "take me out of the party",
   "invite me to the party",
   "keep me away from the party"
  ]
 },
 "carry on": {
  "chunk": "carry on toward the finish line",
  "ja": "ゴールに向かって進み続ける",
  "wrong": [
   "ゴールの手前でやめる",
   "ゴールの手前で引き返す",
   "ゴールを後回しにする"
  ],
  "wrongEn": [
   "give up before the finish line",
   "turn back before the finish line",
   "put off the finish line"
  ]
 },
 "carry out": {
  "chunk": "carry out a series of tests",
  "ja": "一連の検査を実施する",
  "wrong": [
   "一連の検査を取りやめる",
   "一連の検査を指摘する",
   "一連の検査を延期する"
  ],
  "wrongEn": [
   "call off a series of tests",
   "point out a series of tests",
   "put off a series of tests"
  ]
 },
 "account for": {
  "chunk": "account for the delay",
  "ja": "遅れの理由を説明する",
  "wrong": [
   "遅れを取り戻す",
   "遅れを隠す",
   "遅れを責める"
  ],
  "wrongEn": [
   "make up for the delay",
   "cover up the delay",
   "blame the delay"
  ]
 },
 "hold back": {
  "chunk": "hold back tears",
  "ja": "涙をこらえる",
  "wrong": [
   "涙を流す",
   "涙を拭う",
   "涙を見せる"
  ],
  "wrongEn": [
   "shed tears",
   "wipe away tears",
   "show tears"
  ]
 },
 "next to": {
  "chunk": "next to my friend",
  "ja": "友人の隣に",
  "wrong": [
   "友人の向かい側に",
   "友人の後ろに",
   "友人の代わりに"
  ],
  "wrongEn": [
   "across from my friend",
   "behind my friend",
   "instead of my friend"
  ]
 },
 "move over": {
  "chunk": "move over a bit",
  "ja": "少し詰めて場所をあける",
  "wrong": [
   "少し席を立つ",
   "少し引き返す",
   "少し立ち止まる"
  ],
  "wrongEn": [
   "get up for a bit",
   "turn back a bit",
   "stop for a bit"
  ]
 },
 "go abroad": {
  "chunk": "go abroad for the summer",
  "ja": "夏に海外へ行く",
  "wrong": [
   "夏に海外から戻る",
   "夏に国内で過ごす",
   "夏に海外で暮らす"
  ],
  "wrongEn": [
   "come back from abroad for the summer",
   "stay home for the summer",
   "live abroad for the summer"
  ]
 },
 "wear off": {
  "chunk": "the painkiller wears off",
  "ja": "痛み止めの効き目が切れる",
  "wrong": [
   "痛み止めが効き始める",
   "痛み止めを飲み切る",
   "痛み止めを使い果たす"
  ],
  "wrongEn": [
   "the painkiller kicks in",
   "finish off the painkiller",
   "use up the painkiller"
  ]
 },
 "put through": {
  "chunk": "put me through to the manager",
  "ja": "私を責任者に電話でつなぐ",
  "wrong": [
   "私を責任者に紹介する",
   "私を責任者から遠ざける",
   "私の電話を切る"
  ],
  "wrongEn": [
   "introduce me to the manager",
   "keep me away from the manager",
   "hang up on me"
  ]
 },
 "vary with": {
  "chunk": "vary with the season",
  "ja": "季節によって変わる",
  "wrong": [
   "季節に逆らう",
   "季節を問わず変わらない",
   "季節の前に始まる"
  ],
  "wrongEn": [
   "go against the season",
   "stay the same regardless of the season",
   "begin before the season"
  ]
 },
 "come into": {
  "chunk": "come into a large inheritance",
  "ja": "多額の遺産を相続する",
  "wrong": [
   "多額の遺産を手放す",
   "多額の遺産を使い果たす",
   "多額の遺産を放棄する"
  ],
  "wrongEn": [
   "hand over a large inheritance",
   "use up a large inheritance",
   "give up a large inheritance"
  ]
 }
};
