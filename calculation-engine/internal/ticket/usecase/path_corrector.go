package usecase

import (
	"calculation-engine/internal/ticket/graph"
)

// PathCorrector は経路（駅IDの配列）を受け取り、ルールに従って補正した新しい経路を返します。
type PathCorrector interface {
	Correct(path []int, g graph.Graph) ([]int, error)
}

// PipelineCorrector は複数の Corrector を順番に適用します。
type PipelineCorrector struct {
	correctors []PathCorrector
}

func NewPipelineCorrector(correctors ...PathCorrector) *PipelineCorrector {
	return &PipelineCorrector{correctors: correctors}
}

func (p *PipelineCorrector) Correct(path []int, g graph.Graph) ([]int, error) {
	currentPath := path
	var err error
	for _, c := range p.correctors {
		currentPath, err = c.Correct(currentPath, g)
		if err != nil {
			return nil, err
		}
	}
	return currentPath, nil
}

// --- SpecificSectionCorrector ---

type SpecificSectionCorrector struct {
	// From -> To の置換ルール (駅名の配列)
	rules []struct {
		from        []string
		to          []string
		validBefore []string // from[0] の外側に接続してよい駅名リスト（空なら制限なし）
		validAfter  []string // from[末尾] の外側に接続してよい駅名リスト（空なら制限なし）
	}
}

func NewSpecificSectionCorrector() *SpecificSectionCorrector {
	return &SpecificSectionCorrector{
		rules: []struct {
			from        []string
			to          []string
			validBefore []string
			validAfter  []string
		}{
			// 第69条 特定区間における旅客運賃・料金計算の営業キロ又は運賃計算キロ
			{
				// （1）大沼以遠（新函館北斗方面）の各駅と、森以遠（石倉方面）の各駅との相互間
				from:        []string{"大沼", "鹿部", "渡島沼尻", "渡島砂原", "掛澗", "尾白内", "東森", "森"},
				to:          []string{"大沼", "大沼公園", "赤井川", "駒ケ岳", "森"},
				validBefore: []string{"新函館北斗"},
				validAfter:  []string{"石倉"},
			},
			{
				// （2）日暮里以遠（鶯谷又は三河島方面）の各駅と、赤羽以遠（川口、北赤羽又は十条方面）の各駅との相互間
				from:        []string{"日暮里", "尾久", "赤羽"},
				to:          []string{"日暮里", "西日暮里", "田端", "上中里", "王子", "東十条", "赤羽"},
				validBefore: []string{"鶯谷", "三河島"},
				validAfter:  []string{"川口", "北赤羽", "十条"},
			},
			{
				// （3）赤羽以遠（尾久、東十条又は十条方面）の各駅と、大宮以遠（土呂、宮原又は日進方面）の各駅との相互間
				from:        []string{"赤羽", "北赤羽", "浮間舟渡", "戸田公園", "（北）戸田", "北戸田", "武蔵浦和", "中浦和", "南与野", "与野本町", "北与野", "大宮"},
				to:          []string{"赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"},
				validBefore: []string{"尾久", "東十条", "十条"},
				validAfter:  []string{"土呂", "宮原", "日進"},
			},
			{
				// （4）品川以遠（東京、高輪ゲートウェイ又は大崎方面）の各駅と、鶴見以遠（新子安、国道又は羽沢横浜国大方面）の各駅との相互間
				from:        []string{"品川", "西大井", "武蔵小杉", "新川崎", "鶴見"},
				to:          []string{"品川", "大井町", "大森", "蒲田", "川崎", "鶴見"},
				validBefore: []string{"東京", "高輪ゲートウェイ", "大崎"},
				validAfter:  []string{"新子安", "国道", "羽沢横浜国大"},
			},
			{
				// （6）山科以遠（京都方面）の各駅と、近江塩津以遠（新疋田方面）の各駅との相互間
				from:        []string{"山科", "大津", "膳所", "石山", "（東）瀬田", "南草津", "草津", "栗東", "守山", "野洲", "篠原", "近江八幡", "安土", "能登川", "稲枝", "河瀬", "南彦根", "彦根", "米原", "坂田", "田村", "長浜", "虎姫", "河毛", "高月", "木ノ本", "余呉", "近江塩津"},
				to:          []string{"山科", "大津京", "唐崎", "比叡山坂本", "おごと温泉", "堅田", "（湖）小野", "和邇", "蓬莱", "志賀", "比良", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津", "近江中庄", "マキノ", "永原", "近江塩津"},
				validBefore: []string{"京都"},
				validAfter:  []string{"新疋田"},
			},
			{
				// （7）大阪以遠（塚本又は新大阪方面）の各駅と、天王寺以遠（東部市場前又は美章園方面）の各駅との相互間
				from:        []string{"大阪", "（環）福島", "野田", "西九条", "弁天町", "大正", "芦原橋", "今宮", "新今宮", "天王寺"},
				to:          []string{"大阪", "天満", "桜ノ宮", "京橋", "大阪城公園", "森ノ宮", "玉造", "鶴橋", "桃谷", "寺田町", "天王寺"},
				validBefore: []string{"塚本", "新大阪"},
				validAfter:  []string{"東部市場前", "美章園"},
			},
			{
				// （8）三原以遠（糸崎方面）の各駅と、海田市以遠（向洋方面）の各駅との相互間
				from:        []string{"三原", "須波", "安芸幸崎", "忠海", "安芸長浜", "大乗", "竹原", "吉名", "安芸津", "風早", "安浦", "安登", "安芸川尻", "仁方", "広", "新広", "安芸阿賀", "呉", "川原石", "吉浦", "かるが浜", "天応", "呉ポートピア", "小屋浦", "水尻", "坂", "矢野", "海田市"},
				to:          []string{"三原", "本郷", "河内", "（陽）入野", "白市", "西高屋", "（陽）西条", "寺家", "八本松", "瀬野", "中野東", "安芸中野", "海田市"},
				validBefore: []string{"糸崎"},
				validAfter:  []string{"向洋"},
			},
			{
				// （9）岩国以遠（和木方面）の各駅と、櫛ケ浜以遠（徳山方面）の各駅との相互間
				from:        []string{"岩国", "南岩国", "藤生", "通津", "由宇", "（陽）神代", "大畠", "柳井港", "柳井", "田布施", "岩田", "（陽）島田", "光", "（陽）下松", "櫛ケ浜"},
				to:          []string{"岩国", "西岩国", "川西", "柱野", "欽明路", "玖珂", "周防高森", "米川", "高水", "勝間", "大河内", "周防久保", "生野屋", "周防花岡", "櫛ケ浜"},
				validBefore: []string{"和木"},
				validAfter:  []string{"徳山"},
			},
			// 第157条 選択乗車
			{
				// （19）辰野以遠（宮木方面）の各駅と塩尻以遠（洗馬又は広丘方面）の各駅との相互間（小野経由、岡谷経由）
				from:        []string{"辰野", "川岸", "岡谷", "みどり湖", "塩尻"},
				to:          []string{"辰野", "信濃川島", "（中）小野", "塩尻"},
				validBefore: []string{"宮木"},
				validAfter:  []string{"洗馬", "広丘"},
			},
			{
				// （26）大阪以遠（天満又は福島方面）の各駅と、西明石以遠（大久保方面）の各駅との相互間（東海道本線及び山陽本線経由、新幹線経由）
				from:        []string{"大阪", "新大阪", "新神戸", "西明石"},
				to:          []string{"大阪", "塚本", "尼崎", "立花", "甲子園口", "西宮", "さくら夙川", "芦屋", "甲南山手", "摂津本山", "（東）住吉", "六甲道", "摩耶", "灘", "三ノ宮", "元町", "神戸", "兵庫", "新長田", "鷹取", "須磨海浜公園", "須磨", "塩屋", "垂水", "舞子", "朝霧", "明石", "西明石"},
				validBefore: []string{"天満", "（環）福島"},
				validAfter:  []string{"（陽）大久保"},
			},
			{
				// （30）相生以遠（竜野方面）の各駅と東岡山以遠（高島方面）の各駅との相互間（山陽本線経由、赤穂線経由）
				from:        []string{"相生", "西相生", "坂越", "播州赤穂", "天和", "備前福河", "寒河", "日生", "伊里", "備前片上", "西片上", "伊部", "香登", "長船", "邑久", "大富", "西大寺", "大多羅", "東岡山"},
				to:          []string{"相生", "有年", "上郡", "三石", "吉永", "和気", "熊山", "万富", "瀬戸", "（陽）上道", "東岡山"},
				validBefore: []string{"竜野"},
				validAfter:  []string{"高島"},
			},
			{
				// （31）向井原以遠（伊予市方面）の各駅と伊予大洲以遠（西大洲方面）の各駅との相互間（伊予長浜経由、内子経由）
				from:        []string{"向井原", "高野川", "伊予上灘", "下灘", "串", "喜多灘", "伊予長浜", "伊予出石", "伊予白滝", "八多喜", "春賀", "五郎", "伊予大洲"},
				to:          []string{"向井原", "伊予大平", "伊予中山", "伊予立川", "内子", "五十崎", "喜多山", "新谷", "伊予大洲"},
				validBefore: []string{"伊予市"},
				validAfter:  []string{"西大洲"},
			},
			{
				// （41）居能以遠（宇部新川方面）の各駅と、小野田以遠（厚狭方面）の各駅との相互間（宇部線及び山陽本線経由、小野田線経由）
				from:        []string{"居能", "妻崎", "長門長沢", "雀田", "小野田港", "南小野田", "南中川", "目出", "小野田"},
				to:          []string{"居能", "岩鼻", "宇部", "小野田", "厚狭"},
				validBefore: []string{"宇部新川"},
				validAfter:  []string{"厚狭"},
			},
			{
				// （42）新山口以遠（四辻又は周防下郷方面）の各駅と、宇部以遠（小野田方面）の各駅との相互間（山陽本線経由、宇部線経由）
				from:        []string{"新山口", "上嘉川", "深溝", "周防佐山", "岩倉", "阿知須", "岐波", "丸尾", "床波", "常盤", "草江", "宇部岬", "東新川", "琴芝", "宇部新川", "居能", "岩鼻", "宇部"},
				to:          []string{"新山口", "嘉川", "本由良", "厚東", "宇部"},
				validBefore: []string{"四辻", "周防下郷"},
				validAfter:  []string{"小野田"},
			},
			{
				// （52）喜々津以遠（西諫早方面）の各駅と、浦上又は長崎駅との相互間（現川経由、本川内経由）
				from:        []string{"喜々津", "東園", "大草", "本川内", "長与", "（長）高田", "道ノ尾", "西浦上", "浦上"},
				to:          []string{"喜々津", "市布", "肥前古賀", "現川", "浦上"},
				validBefore: []string{"西諫早"},
				validAfter:  []string{"長崎"},
			},
			{
				// （53）喜々津以遠（西諫早方面）の各駅と、長与駅との相互間（現川経由、本川内経由）
				from:        []string{"喜々津", "市布", "肥前古賀", "現川", "浦上", "西浦上", "道ノ尾", "（長）高田", "長与"},
				to:          []string{"喜々津", "東園", "大草", "本川内", "長与"},
				validBefore: []string{"西諫早"},
				validAfter:  []string{},
			},
			{
				// （53）喜々津以遠（西諫早方面）の各駅と、高田駅との相互間（現川経由、本川内経由）
				from:        []string{"喜々津", "市布", "肥前古賀", "現川", "浦上", "西浦上", "道ノ尾", "（長）高田"},
				to:          []string{"喜々津", "東園", "大草", "本川内", "長与", "（長）高田"},
				validBefore: []string{"西諫早"},
				validAfter:  []string{},
			},
			{
				// （53）喜々津以遠（西諫早方面）の各駅と、道ノ尾駅との相互間（現川経由、本川内経由）
				from:        []string{"喜々津", "市布", "肥前古賀", "現川", "浦上", "西浦上", "道ノ尾"},
				to:          []string{"喜々津", "東園", "大草", "本川内", "長与", "（長）高田", "道ノ尾"},
				validBefore: []string{"西諫早"},
				validAfter:  []string{},
			},
			{
				// （53）喜々津以遠（西諫早方面）の各駅と、西浦上駅との相互間（現川経由、本川内経由）
				from:        []string{"喜々津", "東園", "大草", "本川内", "長与", "（長）高田", "道ノ尾", "西浦上"},
				to:          []string{"喜々津", "市布", "肥前古賀", "現川", "浦上", "西浦上"},
				validBefore: []string{"西諫早"},
				validAfter:  []string{},
			},
			{
				// （54）東園駅と、浦上又は長崎駅との相互間（長与経由、現川経由）
				from:        []string{"東園", "喜々津", "市布", "肥前古賀", "現川", "浦上"},
				to:          []string{"東園", "大草", "本川内", "長与", "（長）高田", "道ノ尾", "西浦上", "浦上"},
				validBefore: []string{},
				validAfter:  []string{"長崎"},
			},
			{
				// （54）大草駅と、浦上又は長崎駅との相互間（長与経由、現川経由）
				from:        []string{"大草", "東園", "喜々津", "市布", "肥前古賀", "現川", "浦上"},
				to:          []string{"大草", "本川内", "長与", "（長）高田", "道ノ尾", "西浦上", "浦上"},
				validBefore: []string{},
				validAfter:  []string{"長崎"},
			},
			{
				// （54）本川内駅と、浦上又は長崎駅との相互間（長与経由、現川経由）
				from:        []string{"本川内", "大草", "東園", "喜々津", "市布", "肥前古賀", "現川", "浦上"},
				to:          []string{"本川内", "長与", "（長）高田", "道ノ尾", "西浦上", "浦上"},
				validBefore: []string{},
				validAfter:  []string{"長崎"},
			},
		},
	}
}

func (c *SpecificSectionCorrector) Correct(path []int, g graph.Graph) ([]int, error) {
	if len(path) == 0 {
		return path, nil
	}

	result := make([]int, 0, len(path))

	for i := 0; i < len(path); {
		matched := false
		for _, rule := range c.rules {
			if i+len(rule.from) <= len(path) {
				// 順方向マッチング
				matchFwd := true
				for j, name := range rule.from {
					if g.GetName(path[i+j]) != name {
						matchFwd = false
						break
					}
				}

				// 逆方向マッチング
				matchRev := false
				if !matchFwd {
					matchRev = true
					for j, name := range rule.from {
						if g.GetName(path[i+(len(rule.from)-1-j)]) != name {
							matchRev = false
							break
						}
					}
				}

				if matchFwd || matchRev {
					// 「以遠（〇〇方面）」の条件（外側に接続する駅の制限）をチェックする
					validDirection := true

					var requiredBefore, requiredAfter []string
					if matchFwd {
						requiredBefore = rule.validBefore
						requiredAfter = rule.validAfter
					} else {
						requiredBefore = rule.validAfter
						requiredAfter = rule.validBefore
					}

					// パス内に進入駅（from[0]の手前）が存在する場合、それが許可された駅かチェック
					if i > 0 {
						if len(requiredBefore) == 0 {
							validDirection = false // 空なら外側に駅が存在してはいけない
						} else {
							beforeName := g.GetName(path[i-1])
							found := false
							for _, valid := range requiredBefore {
								if beforeName == valid {
									found = true
									break
								}
							}
							if !found {
								validDirection = false
							}
						}
					}

					// パス内に退出駅（from[末尾]の次）が存在する場合、それが許可された駅かチェック
					endIdx := i + len(rule.from)
					if endIdx < len(path) {
						if len(requiredAfter) == 0 {
							validDirection = false // 空なら外側に駅が存在してはいけない
						} else {
							afterName := g.GetName(path[endIdx])
							found := false
							for _, valid := range requiredAfter {
								if afterName == valid {
									found = true
									break
								}
							}
							if !found {
								validDirection = false
							}
						}
					}

					if !validDirection {
						// 条件を満たさないのでこのルールの適用を見送る
						continue
					}

					// 置換処理
					if matchFwd {
						for _, name := range rule.to {
							if id, ok := g.GetID(name); ok {
								result = append(result, id)
							}
						}
					} else {
						// 逆方向の場合は ToPath も逆順にする
						for j := len(rule.to) - 1; j >= 0; j-- {
							if id, ok := g.GetID(rule.to[j]); ok {
								result = append(result, id)
							}
						}
					}
					i += len(rule.from)
					matched = true
					break
				}
			}
		}
		if !matched {
			result = append(result, path[i])
			i++
		}
	}
	return result, nil
}

// --- ShinkansenOverlapCorrector ---

type ShinkansenOverlapCorrector struct {
	// 新幹線の特例区間を在来線の駅配列に展開するマッピング
	mappings [][]string

	// 控除する重複区間のルール
	overlapDeductions [][]string
}

func NewShinkansenOverlapCorrector() *ShinkansenOverlapCorrector {
	// 控除対象となる折り返し区間の片道ルート（分岐駅 -> 折り返し駅）
	branchPaths := [][]string{
		{"羽前千歳", "北山形", "山形"},
		{"北山形", "山形"},
		{"安積永盛", "（北）郡山"},
		{"宮内", "長岡"},
		{"宝積寺", "岡本", "宇都宮"},
		{"神田", "東京"},
		{"（中）金山", "尾頭橋", "名古屋"},
		{"山科", "京都"},
		{"東岡山", "高島", "西川原", "岡山"},
		{"倉敷", "中庄", "庭瀬", "北長瀬", "岡山"},
		{"浦上", "長崎"},
		{"宇土", "富合", "川尻", "西熊本", "熊本"},
	}

	// 片道ルートから「分岐駅 -> 折り返し駅 -> 分岐駅」の完全な往復パターンを自動生成する
	deductions := make([][]string, len(branchPaths))
	for i, bp := range branchPaths {
		deduction := make([]string, 0, len(bp)*2-1)
		deduction = append(deduction, bp...)
		for k := len(bp) - 2; k >= 0; k-- {
			deduction = append(deduction, bp[k])
		}
		deductions[i] = deduction
	}

	return &ShinkansenOverlapCorrector{
		mappings: [][]string{
			{"熱海", "函南", "三島"},
			{"静岡", "安倍川", "用宗", "焼津", "西焼津", "藤枝", "六合", "（東）島田", "金谷", "菊川", "掛川"},
			{"掛川", "愛野", "袋井", "御厨", "磐田", "豊田町", "天竜川", "浜松"},
			{"浜松", "高塚", "舞阪", "弁天島", "新居町", "鷲津", "新所原", "二川", "豊橋"},
			{"豊橋", "西小坂井", "愛知御津", "三河大塚", "三河三谷", "蒲郡", "三河塩津", "三ケ根", "幸田", "相見", "岡崎", "西岡崎", "安城", "三河安城"},
			{"三河安城", "東刈谷", "野田新町", "刈谷", "逢妻", "大府", "共和", "南大高", "大高", "笠寺", "熱田", "（中）金山", "尾頭橋", "名古屋"},
			{"米原", "彦根", "南彦根", "河瀬", "稲枝", "能登川", "安土", "近江八幡", "篠原", "野洲", "守山", "栗東", "草津", "南草津", "（東）瀬田", "石山", "膳所", "大津", "山科", "京都"},
			{"京都", "西大路", "（東）桂川", "向日町", "長岡京", "（東）山崎", "島本", "高槻", "摂津富田", "ＪＲ総持寺", "茨木", "千里丘", "岸辺", "吹田", "東淀川", "新大阪"},
			{"西明石", "（陽）大久保", "魚住", "土山", "東加古川", "加古川", "宝殿", "曽根", "ひめじ別所", "御着", "東姫路", "姫路"},
			{"姫路", "手柄山平和公園", "英賀保", "はりま勝原", "網干", "竜野", "相生"},
			{"相生", "有年", "上郡", "三石", "吉永", "和気", "熊山", "万富", "瀬戸", "（陽）上道", "東岡山", "高島", "西川原", "岡山"},
			{"岡山", "北長瀬", "庭瀬", "中庄", "倉敷", "西阿知", "新倉敷"},
			{"新倉敷", "金光", "鴨方", "里庄", "笠岡", "大門", "東福山", "福山"},
			{"徳山", "新南陽", "福川", "（陽）戸田", "富海", "防府", "大道", "四辻", "新山口"},
			{"新山口", "嘉川", "本由良", "厚東", "宇部", "小野田", "厚狭"},
			{"厚狭", "埴生", "小月", "長府", "新下関"},
			{"久留米", "荒木", "西牟田", "羽犬塚", "筑後船小屋"},
			{"熊本", "西熊本", "川尻", "富合", "宇土", "松橋", "小川", "有佐", "千丁", "新八代"},
			{"諫早", "西諫早", "喜々津", "市布", "肥前古賀", "現川", "浦上", "長崎"},
			{"東京", "神田", "秋葉原", "御徒町", "上野"},
			{"上野", "鶯谷", "日暮里", "西日暮里", "田端", "上中里", "王子", "東十条", "赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"},
			{"大宮", "土呂", "東大宮", "蓮田", "白岡", "新白岡", "久喜", "東鷲宮", "栗橋", "古河", "野木", "間々田", "小山"},
			{"小山", "小金井", "自治医大", "石橋", "雀宮", "宇都宮"},
			{"宇都宮", "岡本", "宝積寺", "氏家", "蒲須坂", "片岡", "矢板", "（北）野崎", "西那須野", "那須塩原"},
			{"那須塩原", "黒磯", "高久", "黒田原", "豊原", "白坂", "新白河"},
			{"新白河", "白河", "久田野", "泉崎", "矢吹", "鏡石", "須賀川", "安積永盛", "（北）郡山"},
			{"（北）郡山", "日和田", "五百川", "本宮", "杉田", "二本松", "安達", "松川", "金谷川", "南福島", "（北）福島"},
			{"大宮", "宮原", "上尾", "北上尾", "桶川", "北本", "鴻巣", "北鴻巣", "吹上", "行田", "熊谷"},
			{"越後湯沢", "石打", "（上）大沢", "上越国際スキー場前", "塩沢", "六日町", "五日町", "浦佐"},
			{"浦佐", "八色", "小出", "越後堀之内", "北堀之内", "越後川口", "小千谷", "越後滝谷", "宮内", "長岡"},
		},
		overlapDeductions: deductions,
	}
}

// reverseStrings は文字列配列を反転させます
func reverseStrings(s []string) []string {
	res := make([]string, len(s))
	for i := 0; i < len(s); i++ {
		res[i] = s[len(s)-1-i]
	}
	return res
}

func (c *ShinkansenOverlapCorrector) Correct(path []int, g graph.Graph) ([]int, error) {
	if len(path) == 0 {
		return path, nil
	}

	// 1. 新幹線エッジの展開
	expanded := make([]int, 0, len(path))
	expanded = append(expanded, path[0])

	for i := 0; i < len(path)-1; i++ {
		startName := g.GetName(path[i])
		endName := g.GetName(path[i+1])

		mapped := false
		for _, m := range c.mappings {
			if len(m) < 2 {
				continue
			}
			startStation := m[0]
			endStation := m[len(m)-1]

			if startName == startStation && endName == endStation {
				for j, name := range m {
					if j == 0 {
						continue // 始点はすでに入っているのでスキップ
					}
					if id, ok := g.GetID(name); ok {
						expanded = append(expanded, id)
					}
				}
				mapped = true
				break
			} else if startName == endStation && endName == startStation {
				// 逆方向の場合
				revPath := reverseStrings(m)
				for j, name := range revPath {
					if j == 0 {
						continue
					}
					if id, ok := g.GetID(name); ok {
						expanded = append(expanded, id)
					}
				}
				mapped = true
				break
			}
		}

		if !mapped {
			expanded = append(expanded, path[i+1])
		}
	}

	// 2. 決められた重複部分の控除
	result := make([]int, 0, len(expanded))
	for i := 0; i < len(expanded); {
		deducted := false
		for _, deduction := range c.overlapDeductions {
			if i+len(deduction) <= len(expanded) {
				match := true
				for j, name := range deduction {
					if g.GetName(expanded[i+j]) != name {
						match = false
						break
					}
				}
				if match {
					// 控除パターンに一致した場合、その前後（外側）の駅を評価する
					// 「分岐駅を通過する列車に乗車する場合の特例」に基づく要件：
					// 1. パターンの前後に駅が存在すること（通過であるため、始発・終着ではない）
					// 2. パターンに進入する直前の駅が、折り返し区間内の駅ではないこと
					// 3. パターンから退出した直後の駅が、折り返し区間内の駅ではないこと
					// 4. 進入元の駅と退出先の駅が異なること（「一方の線区から他方の線区へ」）
					if i > 0 && i+len(deduction) < len(expanded) {
						beforeStation := g.GetName(expanded[i-1])
						afterStation := g.GetName(expanded[i+len(deduction)])

						// 折り返しパターンの内側の駅（分岐駅から進む最初の駅）
						insideFirst := deduction[1]
						insideLast := deduction[len(deduction)-2]

						if beforeStation != insideFirst && afterStation != insideLast && beforeStation != afterStation {
							// 全ての条件を満たした場合のみ、重複区間を控除する
							if deduction[0] == deduction[len(deduction)-1] {
								result = append(result, expanded[i])
								i += len(deduction)
								deducted = true
								break
							} else {
								i += len(deduction)
								deducted = true
								break
							}
						}
					}
				}
			}
		}
		if !deducted {
			result = append(result, expanded[i])
			i++
		}
	}

	return result, nil
}
