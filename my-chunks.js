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
 }
};
