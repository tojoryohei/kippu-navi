import NextLink from "next/link";

export default function AboutClient() {
    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl leading-relaxed text-gray-800">
            <h1 className="text-3xl font-bold mb-6 border-b pb-4">
                運賃計算と分割乗車券の仕組み
            </h1>

            <p className="mb-8">
                当サイトは，JR線の利用において移動コストを最小化する「最安分割乗車券」と，それを実現する経路を自動的に導出するシステムです．ここでは，なぜ乗車券を分割すると安くなるのかという仕組みと，当サイトを支える情報工学に基づいた計算アルゴリズムについて解説します．
            </p>

            <section className="mb-12">
                <h2 className="text-2xl font-semibold mb-4 text-blue-800 border-l-4 border-blue-600 pl-3">
                    1. なぜ乗車券を分割すると安くなるのか？
                </h2>
                <p className="mb-4">
                    JRの運賃は原則として乗車する営業キロの合計に基づいて算出されますが，以下の5つの要因により，途中の駅で乗車券を分割して購入した方が合計運賃が安価になるケースが存在します．
                </p>


                <ul className="list-disc list-inside space-y-4 ml-2 mb-6">
                    <li>
                        <strong>キロ単価の非単調性：</strong> 運賃のキロ単価は一定ではなく，距離帯によって変動するため，分割した方が安価となる場合があります．
                    </li>
                    <li>
                        <strong>特定区間運賃の利用：</strong> 私鉄などと競合する区間には，通常の距離制運賃よりも安い「特定運賃」が設定されていることがあり，その区間を独立させて分割することで全体が安くなります．
                    </li>
                    <li>
                        <strong>長距離区間における距離帯間隔の拡大：</strong> 営業キロが長くなるにつれて運賃が上昇する間隔が広がるため（例：50kmまでは5kmごと，100km〜600kmは20kmごと），短距離の乗車券を別途購入して長距離側の営業キロを調整することで，全体を低減できる場合があります．
                    </li>
                    <li>
                        <strong>電車特定区間運賃の適用：</strong> 割安な「電車特定区間」と通常の「幹線」をまたがって乗車する場合，全区間が割高な幹線の賃率で計算されてしまうため，境界で分割して安い賃率を適用させます．
                    </li>
                    <li>
                        <strong>特定都区市内制度の適用または回避：</strong> 特定都区市内の特例制度を利用して運賃計算経路を短縮したり，逆に特例の適用を避けるために境界駅で分割することで安くなることがあります．
                    </li>
                </ul>
            </section>

            <section className="mb-12">
                <h2 className="text-2xl font-semibold mb-4 text-blue-800 border-l-4 border-blue-600 pl-3">
                    2. 当サイトの探索アルゴリズムの優位性
                </h2>
                <p className="mb-4">
                    既存の分割乗車券プログラムでは，利用者が事前に「乗車する経路」を指定する必要がありました．
                    また，計算速度を優先して動的計画法（DP）を採用しているため，最適化の過程で同額となる別の分割パターンが枝刈りされてしまい，出力される解が一つに限定されるという課題がありました．
                </p>

                <p className="mb-4">
                    当システムでは，情報工学におけるグラフ理論を応用し，以下の独自アプローチを採用しています．
                </p>

                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <h3 className="text-lg font-bold mb-2">経路指定不要の自動探索</h3>
                    <p className="mb-4">
                        Dijkstra's Algorithm と Yen's Algorithm を組み合わせることで，利用者が経路を指定することなく，分割乗車券によって安価となる「迂回経路」も含めた探索を自動で行います．
                    </p>

                    <h3 className="text-lg font-bold mb-2">ヒューリスティック探索の不採用と厳密解</h3>
                    <p className="mb-4">
                        A* アルゴリズムなどの手法は高速ですが，JRの運賃制度には「営業キロが物理的な距離よりも短く設定されている区間」が存在するため，物理的距離を推定値に用いると実際のコストを過大評価し，最安解を見逃すリスクがあります．そのため，本システムは解の正当性を完全に保証する手法を採用しています．
                    </p>

                    <h3 className="text-lg font-bold mb-2">同額パターンの完全列挙</h3>
                    <p>
                        現実の鉄道利用においては，分割位置による途中下車の可否など，利便性を左右する要因が存在します．当システムは最適化の過程で枝刈りを行わず，同額となる複数の最安分割パターンを完全に列挙し，利用者の実用上の選択肢を全て提示します．
                    </p>
                </div>
            </section>

            <section className="mb-12">
                <h2 className="text-2xl font-semibold mb-4 text-blue-800 border-l-4 border-blue-600 pl-3">
                    3. 運賃の「逆転現象」への対応
                </h2>
                <p className="mb-4">
                    特定の条件下では，乗車経路を外方へ延伸することで運賃が安くなる「逆転現象」が発生します．
                    例えば，特定都区市内制度において，あえて目的地の先の駅まで切符を買うことで，発駅が都区市内中心駅からの計算に切り替わり，結果的に運賃が安くなる現象などです．
                </p>
                <p>
                    当システムでは，こうした複雑な運賃規則（経路特定区間や特定都区市内など）をアルゴリズムの内部に組み込み，延伸による逆転現象も考慮した「真の最安運賃」を導出する処理を行っています．
                </p>
            </section>
        </div>
    );
}