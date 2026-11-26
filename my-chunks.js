// マイ単語（ユーザーが追加した句動詞）用のチャンクデータ。キーは句動詞名（小文字、*Nなし）。
// chunk: 出題する英語のかたまり / ja: その日本語訳（正解）/ wrong: 逆方向の4択の不正解3つ
// マイ単語は端末ごとのデータなので、番号ではなく句動詞名で対応づける。
// freq(high/mid/low) / alt(ほかによく使う言い方) / freqWhy(頻度の理由) も同じ句動詞名で持たせ、allWords()でマイ単語に重ねる。
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
  ],
  "freq": "low",
  "alt": "deposit into A（Aに預け入れる）／put money into A（Aにお金を入れる）",
  "freqWhy": "日常では「put money into／deposit」のほうが先に使われるため、この表現の出番は少なめ。ただし年金や保険料など、定期的に積み立てる払い込みを言うときは、depositより pay into"
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
  ],
  "freq": "low",
  "alt": "base A on（Aに基づく）／judge from（〜から判断する）",
  "freqWhy": "日常では「base on／judge from」のほうが先に使われるため、この表現の出番は少なめ。ただしうわさや情報だけを頼りに判断すると言うときは、base onより go off of（くだけた言い方）"
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
  ],
  "freq": "mid",
  "alt": "get off（降りる）／come down（降りてくる）",
  "freqWhy": "椅子・木・はしごなど、高い所から降りるときの定番。乗り物から降りるときは get off"
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
  ],
  "freq": "mid",
  "alt": "come out（抜ける）／drop out（抜け落ちる）",
  "freqWhy": "髪や歯が抜けるときの定番。「けんかする」の意味でも使うので、会話で出番は多め"
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
  ],
  "freq": "low",
  "alt": "ride（乗る）／get on（乗る）",
  "freqWhy": "日常では「ride／get on」のほうが先に使われるため、この表現の出番は少なめ。ただしメリーゴーラウンドや馬など、乗ったまま運ばれ続けるときは、get onより ride on"
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
  ],
  "freq": "mid",
  "alt": "demolish（取り壊す、改まった言い方）／knock down（壊す）",
  "freqWhy": "古い建物の取り壊しのニュースなどで使うが、demolish でも言える"
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
  ],
  "freq": "mid",
  "alt": "require（必要とする）／demand（求める）",
  "freqWhy": "「〜が必要だ・求められる」と言うとき（This calls for a celebration.）に出るが、require のほうが先に浮かぶ人も多い"
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
  ],
  "freq": "mid",
  "alt": "get to（着く、最も一般的）／reach（到着する）",
  "freqWhy": "到着を丁寧に言うときに使うが、会話では get to のほうが多い"
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
  ],
  "freq": "high",
  "alt": "check（確認する）／be sure（確実にする）",
  "freqWhy": "確認や念押しは毎日のように言うので、基本中の基本"
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
  ],
  "freq": "high",
  "alt": "fall（下がる）／drop（下がる）",
  "freqWhy": "気温・価格・数値の下落や、日が沈むときなど、毎日のように使う"
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
  ],
  "freq": "low",
  "alt": "be honest with（正直に話す）／tell the truth（本当のことを言う）",
  "freqWhy": "日常では「be honest with／tell the truth」のほうが先に使われるため、この表現の出番は少なめ。ただし言いにくいことを包み隠さず話すときは、be honest withより level with（くだけた言い方）"
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
  ],
  "freq": "low",
  "alt": "hang out with（つるむ）／get involved with（付き合い始める）",
  "freqWhy": "日常では「hang out with／get involved with」のほうが先に使われるため、この表現の出番は少なめ。ただし新しい仲間や、あまり好ましくない相手と付き合い出すと言うときは、hang out withより take up with"
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
  ],
  "freq": "low",
  "alt": "be covered in（〜に包まれる）／be lit by（〜に照らされる）",
  "freqWhy": "日常では「be covered in／be lit by」のほうが先に使われるため、この表現の出番は少なめ。ただし日差しや月明かりに包まれる様子を詩的に描くとき（bathed in light）は、be lit byより bathe in"
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
  ],
  "freq": "mid",
  "alt": "reach（届く）／go as far as（〜まで及ぶ）",
  "freqWhy": "範囲や距離が「〜まで及ぶ」と言うときに使う。reach でも言える"
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
  ],
  "freq": "mid",
  "alt": "tell（報告する）／be managed by（〜の部下だ）",
  "freqWhy": "「誰の下で働いているか」を言う定番（I report to the director.）で、職場の会話によく出る"
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
  ],
  "freq": "low",
  "alt": "look for（探す）／search for（探し出す）",
  "freqWhy": "日常では「look for／search for」のほうが先に使われるため、この表現の出番は少なめ。ただし奥にしまい込んだ物をわざわざ探し出すと言うときは、look forより hunt out"
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
  ],
  "freq": "low",
  "alt": "get involved（巻き込まれる）／pull A into B（AをBに引き込む）",
  "freqWhy": "日常では「get involved／pull A into B」のほうが先に使われるため、この表現の出番は少なめ。ただし望んでいない人を無理やり問題に引きずり込むと言うときは、involveより drag into"
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
  ],
  "freq": "high",
  "alt": "continue（続ける、改まった言い方）／keep going（続ける）",
  "freqWhy": "「そのまま続ける」と言うときの定番。会話でも仕事でもよく出る"
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
  ],
  "freq": "high",
  "alt": "do（行う）／perform（実施する）",
  "freqWhy": "計画・調査・命令などを実行するときの定番で、仕事の話題で頻出"
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
  ],
  "freq": "mid",
  "alt": "explain（説明する）／make up（占める）",
  "freqWhy": "理由を説明するときや、割合を言うとき（account for 20%）に使う"
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
  ],
  "freq": "high",
  "alt": "stop（止める）／keep back（抑える）",
  "freqWhy": "感情・情報・人を抑えるときの定番で、日常から仕事まで広く使う"
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
  ],
  "freq": "high",
  "alt": "beside（〜の隣に）／by（〜のそばに）",
  "freqWhy": "場所を言うとき毎日のように使う、基本中の基本"
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
  ],
  "freq": "mid",
  "alt": "scoot over（詰める）／make room（場所をあける）",
  "freqWhy": "座席やベンチで「少し詰めて」と頼むときの定番"
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
  ],
  "freq": "mid",
  "alt": "travel overseas（海外へ行く）／go overseas（海外へ行く）",
  "freqWhy": "海外旅行や留学の話題でよく出る。overseas でも言える"
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
  ],
  "freq": "mid",
  "alt": "fade（薄れる）／stop working（効かなくなる）",
  "freqWhy": "薬やお酒の効き目、痛みが引くときの定番"
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
  ],
  "freq": "low",
  "alt": "connect（つなぐ）／transfer（転送する）",
  "freqWhy": "日常では「connect／transfer」のほうが先に使われるため、この表現の出番は少なめ。ただし電話を担当者につなぐと言うとき（I'll put you through.）は、connectより put through"
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
  ],
  "freq": "low",
  "alt": "change with（〜で変わる）／depend on（〜しだいだ）",
  "freqWhy": "日常では「change with／depend on」のほうが先に使われるため、この表現の出番は少なめ。ただしAの違いに応じて変動すると言うとき（prices vary with the season）は、change withより vary with"
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
  ],
  "freq": "low",
  "alt": "inherit（相続する）／get（手に入れる）",
  "freqWhy": "日常では「inherit／get」のほうが先に使われるため、この表現の出番は少なめ。ただし遺産や大金が突然手元に入ってくると言うとき（come into money）は、inheritより come into"
 },
 "burst out": {
  "chunk": "They burst out laughing",
  "ja": "彼らは吹き出した",
  "wrong": [
   "彼らは声を殺して笑った",
   "彼らは笑いをこらえた",
   "彼らは笑って許した"
  ],
  "wrongEn": [
   "They giggled quietly",
   "They held back laughter",
   "They laughed it off"
  ],
  "freq": "mid",
  "alt": "start laughing / crying suddenly（急に笑い出す・泣き出す）／blurt out（うっかり口走る）／exclaim（声を上げる、改まった言い方）",
  "freqWhy": "「吹き出す」「わっと泣き出す」の描写で、会話にも物語にもよく出る。ただし burst into tears のほうが先に浮かぶ人も多い"
 }
};
