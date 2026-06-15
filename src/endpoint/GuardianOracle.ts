import { masterSetup} from '../util/util'
import {ethers} from 'ethers'
import { logger } from '../util/logger'
import Colors from 'colors/safe'
import { inspect } from 'node:util'
import SeamioOracle_ABI from './ABI/SeamioOracleABI.json'

const CoinMarketCap = require('coinmarketcap-api')

/** CoNET BeamioOracle（224422）；与 deployments/conet-addresses.json `rpcUrl` / `beamioOracle` 一致 */
const providerConet = new ethers.JsonRpcProvider('https://publicrpc.conet.network')
/** Base 主网 BeamioOracle；与 CoNET 不同链，可并行喂价且无 nonce 冲突 */
const providerBaseBackup = new ethers.JsonRpcProvider('https://base-rpc.conet.network')

const apiKey = masterSetup.CoinMarketCapAPIKey
const conetBeamioOracleAddr = '0x77CB8358c5a37aB7190b0A2C7EaA7fEeDCF11008'
const managerWallet = new ethers.Wallet(masterSetup.settle_contractAdmin[0], providerConet)
const beamioWallet = new ethers.Wallet(masterSetup.settle_contractAdmin[0], providerBaseBackup)
const conetBeamioOracle = new ethers.Contract(conetBeamioOracleAddr, SeamioOracle_ABI, managerWallet)
const client = new CoinMarketCap(apiKey)

/** Base 主网 BeamioOracle（8453） */
const beamioOracleAddr = '0x77CB8358c5a37aB7190b0A2C7EaA7fEeDCF11008'
const beamioOracle = new ethers.Contract(beamioOracleAddr, SeamioOracle_ABI, beamioWallet)

logger(`admin wallet ${managerWallet.address} | BeamioOracle CoNET ${conetBeamioOracleAddr} | Base ${beamioOracleAddr}`)

/** BeamioCurrency.CurrencyType 对应索引: CAD=0, USD=1, JPY=2, CNY=3, USDC=4, HKD=5, EUR=6, SGD=7, TWD=8 */

const CURRENCY_IDS = { CAD: 0, USD: 1, JPY: 2, CNY: 3, USDC: 4, HKD: 5, EUR: 6, SGD: 7, TWD: 8 } as const;

/**
 * 将数据喂给 BeamioOracle（CoNET 或 Base），覆盖 CurrencyType 全部 9 种货币。
 */
const updateBeamioOracleOnChain = async (
    chainLabel: string,
    provider: ethers.JsonRpcProvider,
    oracle: ethers.Contract,
    fx: { USDCAD: number; USDJPY: number; USDCNY: number; USDHKD: number; USDEUR: number; USDSGD: number; USDTWD: number },
    cmcQuotes: { data: Record<string, { quote: { USD: { price: number } } }> }
) => {
    try {
        const usdcPrice = Number(cmcQuotes.data['3408'].quote.USD.price);

        if (Math.abs(usdcPrice - 1) > 0.05) {
            logger(Colors.yellow(`⚠️ WARNING [${chainLabel}]: USDC de-peg detected! Current Price: ${usdcPrice}`));
        }

        const ratesData = [
            { id: CURRENCY_IDS.CAD, symbol: 'CAD', rateUsd: 1 / fx.USDCAD },
            { id: CURRENCY_IDS.USD, symbol: 'USD', rateUsd: 1 },
            { id: CURRENCY_IDS.JPY, symbol: 'JPY', rateUsd: 1 / fx.USDJPY },
            { id: CURRENCY_IDS.CNY, symbol: 'CNY', rateUsd: 1 / fx.USDCNY },
            { id: CURRENCY_IDS.USDC, symbol: 'USDC', rateUsd: usdcPrice },
            { id: CURRENCY_IDS.HKD, symbol: 'HKD', rateUsd: 1 / fx.USDHKD },
            { id: CURRENCY_IDS.EUR, symbol: 'EUR', rateUsd: 1 / fx.USDEUR },
            { id: CURRENCY_IDS.SGD, symbol: 'SGD', rateUsd: 1 / fx.USDSGD },
            { id: CURRENCY_IDS.TWD, symbol: 'TWD', rateUsd: 1 / fx.USDTWD },
        ];

        const ids: number[] = [];
        const rates: bigint[] = [];

        logger(Colors.cyan(`[${chainLabel}] Preparing batch update for ${ratesData.length} currencies...`));

        for (const r of ratesData) {
            ids.push(r.id);
            const rateE18 = ethers.parseUnits(r.rateUsd.toFixed(18), 18);
            rates.push(rateE18);
            logger(`  - ${r.symbol}: 1 ${r.symbol} = ${r.rateUsd.toFixed(6)} USD`);
        }

        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n / 100n) : undefined;

        logger(Colors.cyan(`[${chainLabel}] Sending batch TX...`));

        const tx = await oracle.updateRatesBatch(ids, rates, {
            gasPrice,
        });

        logger(Colors.yellow(`[${chainLabel}] Batch TX sent: ${tx.hash}`));
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            logger(Colors.green(`✅ [${chainLabel}] BeamioOracle batch update successful in block ${receipt.blockNumber}!`));
        } else {
            throw new Error('Transaction reverted by the network.');
        }
    } catch (ex) {
        logger(Colors.red(`❌ [${chainLabel}] updateBeamioOracle Error!`), ex);
    }
}

const linten = 1000 * 60 * 10

const getIDs = () => {
	return client.getIdMap({symbol: ['BNB', 'DAI', 'ETH', 'USDT', 'USDC', 'TRX']}).then((data: any) => {
		logger(inspect(data, false, 3, true))
	})
}

const getUsdFxFromCoinbase = async () => {
	const res = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD')
	if (!res.ok) throw new Error(`coinbase fx failed: ${res.status}`)

	const json: any = await res.json()
	const rates = json?.data?.rates || {}

	const cad = Number(rates.CAD)
	const jpy = Number(rates.JPY)
	const cny = Number(rates.CNY) // 人民币 ISO = CNY
	const hkd = Number(rates.HKD) // 港元 ISO = HKD
	const eur = Number(rates.EUR) // 欧元 ISO = EUR
	const sgd = Number(rates.SGD) // 新加坡元 ISO = SGD
	const twd = Number(rates.TWD) // 新台币 ISO = TWD

	if (!cad || !jpy || !cny || !hkd || !eur || !sgd || !twd) {
		throw new Error('missing CAD/JPY/CNY/HKD/EUR/SGD/TWD in coinbase rates')
	}

	return {
		USDCAD: cad,
		USDJPY: jpy,
		USDCNY: cny,
		USDHKD: hkd,
		USDEUR: eur,
		USDSGD: sgd,
		USDTWD: twd
	}
}

const runTick = async () => {
    try {
        const [cmc, fx] = await Promise.all([
        client.getQuotes({ id: [1839, 4943, 1027, 825, 3408, 1958] }),
        getUsdFxFromCoinbase()
        ])

		await Promise.all([
			updateBeamioOracleOnChain('CoNET', providerConet, conetBeamioOracle, fx, cmc),
			updateBeamioOracleOnChain('Base', providerBaseBackup, beamioOracle, fx, cmc),
		])

        
    } finally {
        setTimeout(runTick, linten)
    }
}
// getIDs()
runTick()

// logger(managerWallet.address)
