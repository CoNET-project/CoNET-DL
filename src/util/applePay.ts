import { logger } from "./logger"
import {v4} from 'uuid'
import {masterSetup} from './util'
import {ethers} from 'ethers'
import AppleStoreSubscriptionABI from './appleSubscription.ABI.json'
import SP_ABI from '../endpoint/CoNET_DEPIN-mainnet_SP-API.json'
import duplicateFactory_ABI from '../endpoint/duplicateFactory.ABI.json'
/**
 * 改造成支持 “JWS（按行分隔）” 的恢复校验。
 * @param receipt   iOS 端上传的 JWS 串，可能多条，以 \n 分隔
 * @param _walletAddress  你的钱包地址（Eth/任意）
 * @param solanaWallet    Solana 地址
 */

const CONET_MAINNET = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network') 
const SP_passport_addr = '0x054498c353452A6F29FcA5E7A0c4D13b2D77fF08'
const appleStoreWallet = new ethers.Wallet(masterSetup.appleStore, CONET_MAINNET)

const appleStoreSC = [new ethers.Contract('0x92FF779aF409Fb399Be9C8dDD91C08d50e90F2fA', AppleStoreSubscriptionABI, appleStoreWallet)]
const SP_Passport_SC_readonly = new ethers.Contract(SP_passport_addr, SP_ABI, CONET_MAINNET)

const aplleStoreObjPool: {
    transactionId: string
    to: string
    solana: string
    plan: planStruct
    restore: boolean

}[] = []
const duplicateFactoryAddr = '0x87A70eD480a2b904c607Ee68e6C3f8c54D58FB08'
const SPDuplicateFactoryContract = new ethers.Contract(duplicateFactoryAddr, duplicateFactory_ABI, CONET_MAINNET)

const aplleStoreObjProcess = async () => {
    const obj = aplleStoreObjPool.shift()
    if (!obj) {
        return
    }

    const SC = appleStoreSC.shift()

    if (!SC) {
        aplleStoreObjPool.unshift(obj)
        return
    }

    
    let tx = null
    const NFT = parseInt((await SP_Passport_SC_readonly.currentID()).toString()) + 1
    const duplicateAccount = await SPDuplicateFactoryContract.duplicateList(obj.to)
    const assetAccount = duplicateAccount === ethers.ZeroAddress ? obj.to : duplicateAccount
    try {
        switch(obj.plan) {
            case '299': {
                tx = obj.restore ? await  SC.restoreSPMember(assetAccount, obj.transactionId, obj.solana, v4()) :  await SC.initSPMember(assetAccount, obj.transactionId, obj.solana, 31, v4())
                break
            }
            case '2400': {
                tx = obj.restore ? await  SC.restoreSPMember(assetAccount, obj.transactionId, obj.solana, v4()) : await SC.initSPMember(assetAccount, obj.transactionId, obj.solana, 366, v4())
                break
            }
            case '3100': {
                tx = obj.restore ? await  SC.restoreGoldMember(assetAccount, obj.transactionId, obj.solana, v4()) : await SC.initSPGoldMember(assetAccount, obj.transactionId, obj.solana,v4())
                break
            }
            default: {
                logger(`aplleStoreObjProcess unknow PLAN ${obj.plan} Error `)
            }
        }
    } catch (ex: any) {
        logger(`aplleStoreObjProcess CATCH EX Error ${ex.message} `)
    }

    if (tx?.wait) {
        await tx.wait ()
        logger(`aplleStoreObjProcess SUCCESS ${tx.hash}`)
        if (payment_waiting_status) {
            payment_waiting_status.set(obj.to.toLowerCase(), NFT)
        }

    }
    appleStoreSC.unshift(SC)
    setTimeout(() => {
        aplleStoreObjProcess()
    }, 3000)
    
}


import {
    SignedDataVerifier,
    Environment,
    JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library"

import { readFileSync } from 'node:fs'
import {join} from 'node:path'
 import {homedir} from 'node:os'
import { inspect } from "node:util"

const bundleId = "com.fx168.CoNETVPN1.CoNETVPN1"
const appAppleId = 6740261324
const environment: Environment = Environment.SANDBOX

/**
 * 构建 Apple 验签客户端（按环境）
 * 注意：rootCertificates 需要 AppleRootCA-G3 与 AppleWWDRCAG5
 * 建议将证书放在 ~/.applepay/ 目录
 */

function buildVerifier(env: Environment) {
	const rootCertPath = join(homedir(), "AppleRootCA-G3.cer")
	const wwdrPath = join(homedir(), "AppleWWDRCAG5.cer")
	const rootCert = readFileSync(rootCertPath)
	const wwdrCert = readFileSync(wwdrPath)
	return new SignedDataVerifier([rootCert, wwdrCert], false, env, bundleId, appAppleId)
}

export type ReceiptProcessBuckets = {
    subscriptions: JWSTransactionDecodedPayload[]        // 全部“有效订阅”
    oneTimePurchases: JWSTransactionDecodedPayload[]     // 全部“一次性购买”（非订阅）
}

/**
 * 验证 iOS 端上传的一到多条 JWS（以 \n 分行），并将“有效订阅”与“一次性购买”分开返回。
 * - 有效订阅：未撤销/未退款，且 expiresDate > now
 * - 一次性购买：非订阅的交易（NON_CONSUMABLE/CONSUMABLE），未撤销/未退款
 * 返回值：boolean 兼容旧逻辑——是否有任意可发放的合格交易
 */
export async function appleReceipt(
    receiptMultiline: string,
    _walletAddress: string,
    solanaWallet: string,
    buckets?: ReceiptProcessBuckets,   // 可选：传入以收集两类交易；不传保持旧行为
): Promise<boolean> {
	const jwss = (receiptMultiline || '')
		.split(/\r?\n/)
		.map(s => s.trim())
		.filter(Boolean)

	if (jwss.length === 0) {
		logger("[ApplePay] 空的 JWS 串")
		return false
	}

	const primaryVerifier = buildVerifier(Environment.PRODUCTION)
	const fallbackVerifier = buildVerifier(Environment.SANDBOX)

	const walletAddress = _walletAddress.toLowerCase()
	let matched = false

	for (const jws of jwss) {
		let tx: JWSTransactionDecodedPayload | null = null

		// 先 Production，失败再 Sandbox
		try {
		    tx = await primaryVerifier.verifyAndDecodeTransaction(jws)
		} catch {
            try {
                tx = await fallbackVerifier.verifyAndDecodeTransaction(jws)
            } catch (e2) {
                logger(`[ApplePay] ❌ 验签失败，跳过一条 JWS: ${(e2 as Error).message}`)
                continue
            }
		}

		// 防御式读取关键信息
		const productId = (tx as any)?.productId as string | undefined
		const productType = (((tx as any)?.productType) || ((tx as any)?.type)) as string | undefined
		const transactionId = (tx as any)?.transactionId as string | undefined
		const originalTransactionId = (tx as any)?.originalTransactionId as string | undefined
		const expiresDateMs = Number((tx as any)?.expiresDate) || 0
		const revocationDateMs = Number((tx as any)?.revocationDate) || 0
		const revocationReason = (tx as any)?.revocationReason as number | undefined

		if (!productId || !transactionId) {
			logger(`[ApplePay] ⚠️ 交易缺少 productId/transactionId，已跳过`)
			continue
		}

		// 过滤撤销/退款
		const revoked = !!revocationDateMs || (revocationReason ?? 0) !== 0
		if (revoked) {
			logger(`[ApplePay] ⛔️ 跳过撤销/退款交易 ${transactionId} (${productId})`)
			continue
		}

		// 订阅 / 一次性购买 分类收集
		const typeStr = (productType || '')
		const now = Date.now()
		const isSubscription =
		/AUTO[_-]?RENEWABLE[_-]?SUBSCRIPTION/i.test(typeStr) || ('expiresDate' in (tx as any))

		if (isSubscription) {
			if (expiresDateMs > now) {

				buckets?.subscriptions?.push(tx)
                aplleStoreObjPool.push({
                    transactionId,
                    to: walletAddress,
                    solana: solanaWallet,
                    plan: productId === '001' ? '299' : '2400',
                    restore: true
                })

                aplleStoreObjProcess()
			} else {
				logger(`[ApplePay] 🕓 订阅已过期，忽略 ${transactionId} (${productId})`)
				// 过期订阅不算命中
				continue
			}
		} else {
			buckets?.oneTimePurchases?.push(tx)
            if (productId === '006') {
                aplleStoreObjPool.push({
                    transactionId,
                    to: walletAddress,
                    solana: solanaWallet,
                    plan: '3100' ,
                    restore: true
                })
                aplleStoreObjProcess()
            }

		}

		// 套餐映射逻辑（如有）——此处保留示例
		const plan: "299" | "2400" | "3100" =
            productId === "001" ? "299" :
            productId === "002" ? "2400" : "3100"

		// 发放/标记逻辑：保持一致（这里只做占位
		matched = true

		logger(`appleReceipt JWS PURCHASE success ${_walletAddress}`, {
            productId,
            originalTransactionId,
            transactionId,
            type: typeStr,
            uuid: v4()
		})



		// 旧逻辑是命中即返回；为收集“全部有效交易”，此处继续遍历
		continue
	}

	return matched
}

let payment_waiting_status: Map<string, number|string>|null = null

export const setup_payment_waiting_status = (_status: Map<string, number|string>) => {
    payment_waiting_status = _status
}


export const execAppleVesting = (transactionId: string, to: string, solana: string, plan: planStruct, ) => {
    
    aplleStoreObjPool.push({
        transactionId,
        to,
        solana,
        plan,
        restore: false
    })
    logger(`execAppleVesting`)
    aplleStoreObjProcess()
}

//  0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff
const test = () => {
    const jws = "eyJhbGciOiJFUzI1NiIsIng1YyI6WyJNSUlFTURDQ0E3YWdBd0lCQWdJUWZUbGZkMGZOdkZXdnpDMVlJQU5zWGpBS0JnZ3Foa2pPUFFRREF6QjFNVVF3UWdZRFZRUURERHRCY0hCc1pTQlhiM0pzWkhkcFpHVWdSR1YyWld4dmNHVnlJRkpsYkdGMGFXOXVjeUJEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURUxNQWtHQTFVRUN3d0NSell4RXpBUkJnTlZCQW9NQ2tGd2NHeGxJRWx1WXk0eEN6QUpCZ05WQkFZVEFsVlRNQjRYRFRJek1Ea3hNakU1TlRFMU0xb1hEVEkxTVRBeE1URTVOVEUxTWxvd2daSXhRREErQmdOVkJBTU1OMUJ5YjJRZ1JVTkRJRTFoWXlCQmNIQWdVM1J2Y21VZ1lXNWtJR2xVZFc1bGN5QlRkRzl5WlNCU1pXTmxhWEIwSUZOcFoyNXBibWN4TERBcUJnTlZCQXNNSTBGd2NHeGxJRmR2Y214a2QybGtaU0JFWlhabGJHOXdaWElnVW1Wc1lYUnBiMjV6TVJNd0VRWURWUVFLREFwQmNIQnNaU0JKYm1NdU1Rc3dDUVlEVlFRR0V3SlZVekJaTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEEwSUFCRUZFWWUvSnFUcXlRdi9kdFhrYXVESENTY1YxMjlGWVJWLzB4aUIyNG5DUWt6UWYzYXNISk9OUjVyMFJBMGFMdko0MzJoeTFTWk1vdXZ5ZnBtMjZqWFNqZ2dJSU1JSUNCREFNQmdOVkhSTUJBZjhFQWpBQU1COEdBMVVkSXdRWU1CYUFGRDh2bENOUjAxREptaWc5N2JCODVjK2xrR0taTUhBR0NDc0dBUVVGQndFQkJHUXdZakF0QmdnckJnRUZCUWN3QW9ZaGFIUjBjRG92TDJObGNuUnpMbUZ3Y0d4bExtTnZiUzkzZDJSeVp6WXVaR1Z5TURFR0NDc0dBUVVGQnpBQmhpVm9kSFJ3T2k4dmIyTnpjQzVoY0hCc1pTNWpiMjB2YjJOemNEQXpMWGQzWkhKbk5qQXlNSUlCSGdZRFZSMGdCSUlCRlRDQ0FSRXdnZ0VOQmdvcWhraUc5Mk5rQlFZQk1JSCtNSUhEQmdnckJnRUZCUWNDQWpDQnRneUJzMUpsYkdsaGJtTmxJRzl1SUhSb2FYTWdZMlZ5ZEdsbWFXTmhkR1VnWW5rZ1lXNTVJSEJoY25SNUlHRnpjM1Z0WlhNZ1lXTmpaWEIwWVc1alpTQnZaaUIwYUdVZ2RHaGxiaUJoY0hCc2FXTmhZbXhsSUhOMFlXNWtZWEprSUhSbGNtMXpJR0Z1WkNCamIyNWthWFJwYjI1eklHOW1JSFZ6WlN3Z1kyVnlkR2xtYVdOaGRHVWdjRzlzYVdONUlHRnVaQ0JqWlhKMGFXWnBZMkYwYVc5dUlIQnlZV04wYVdObElITjBZWFJsYldWdWRITXVNRFlHQ0NzR0FRVUZCd0lCRmlwb2RIUndPaTh2ZDNkM0xtRndjR3hsTG1OdmJTOWpaWEowYVdacFkyRjBaV0YxZEdodmNtbDBlUzh3SFFZRFZSME9CQllFRkFNczhQanM2VmhXR1FsekUyWk9FK0dYNE9vL01BNEdBMVVkRHdFQi93UUVBd0lIZ0RBUUJnb3Foa2lHOTJOa0Jnc0JCQUlGQURBS0JnZ3Foa2pPUFFRREF3Tm9BREJsQWpFQTh5Uk5kc2twNTA2REZkUExnaExMSndBdjVKOGhCR0xhSThERXhkY1BYK2FCS2pqTzhlVW85S3BmcGNOWVVZNVlBakFQWG1NWEVaTCtRMDJhZHJtbXNoTnh6M05uS20rb3VRd1U3dkJUbjBMdmxNN3ZwczJZc2xWVGFtUllMNGFTczVrPSIsIk1JSURGakNDQXB5Z0F3SUJBZ0lVSXNHaFJ3cDBjMm52VTRZU3ljYWZQVGp6Yk5jd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NakV3TXpFM01qQXpOekV3V2hjTk16WXdNekU1TURBd01EQXdXakIxTVVRd1FnWURWUVFERER0QmNIQnNaU0JYYjNKc1pIZHBaR1VnUkdWMlpXeHZjR1Z5SUZKbGJHRjBhVzl1Y3lCRFpYSjBhV1pwWTJGMGFXOXVJRUYxZEdodmNtbDBlVEVMTUFrR0ExVUVDd3dDUnpZeEV6QVJCZ05WQkFvTUNrRndjR3hsSUVsdVl5NHhDekFKQmdOVkJBWVRBbFZUTUhZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUNJRFlnQUVic1FLQzk0UHJsV21aWG5YZ3R4emRWSkw4VDBTR1luZ0RSR3BuZ24zTjZQVDhKTUViN0ZEaTRiQm1QaENuWjMvc3E2UEYvY0djS1hXc0w1dk90ZVJoeUo0NXgzQVNQN2NPQithYW85MGZjcHhTdi9FWkZibmlBYk5nWkdoSWhwSW80SDZNSUgzTUJJR0ExVWRFd0VCL3dRSU1BWUJBZjhDQVFBd0h3WURWUjBqQkJnd0ZvQVV1N0Rlb1ZnemlKcWtpcG5ldnIzcnI5ckxKS3N3UmdZSUt3WUJCUVVIQVFFRU9qQTRNRFlHQ0NzR0FRVUZCekFCaGlwb2RIUndPaTh2YjJOemNDNWhjSEJzWlM1amIyMHZiMk56Y0RBekxXRndjR3hsY205dmRHTmhaek13TndZRFZSMGZCREF3TGpBc29DcWdLSVltYUhSMGNEb3ZMMk55YkM1aGNIQnNaUzVqYjIwdllYQndiR1Z5YjI5MFkyRm5NeTVqY213d0hRWURWUjBPQkJZRUZEOHZsQ05SMDFESm1pZzk3YkI4NWMrbGtHS1pNQTRHQTFVZER3RUIvd1FFQXdJQkJqQVFCZ29xaGtpRzkyTmtCZ0lCQkFJRkFEQUtCZ2dxaGtqT1BRUURBd05vQURCbEFqQkFYaFNxNUl5S29nTUNQdHc0OTBCYUI2NzdDYUVHSlh1ZlFCL0VxWkdkNkNTamlDdE9udU1UYlhWWG14eGN4ZmtDTVFEVFNQeGFyWlh2TnJreFUzVGtVTUkzM3l6dkZWVlJUNHd4V0pDOTk0T3NkY1o0K1JHTnNZRHlSNWdtZHIwbkRHZz0iLCJNSUlDUXpDQ0FjbWdBd0lCQWdJSUxjWDhpTkxGUzVVd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NVFF3TkRNd01UZ3hPVEEyV2hjTk16a3dORE13TVRneE9UQTJXakJuTVJzd0dRWURWUVFEREJKQmNIQnNaU0JTYjI5MElFTkJJQzBnUnpNeEpqQWtCZ05WQkFzTUhVRndjR3hsSUVObGNuUnBabWxqWVhScGIyNGdRWFYwYUc5eWFYUjVNUk13RVFZRFZRUUtEQXBCY0hCc1pTQkpibU11TVFzd0NRWURWUVFHRXdKVlV6QjJNQkFHQnlxR1NNNDlBZ0VHQlN1QkJBQWlBMklBQkpqcEx6MUFjcVR0a3lKeWdSTWMzUkNWOGNXalRuSGNGQmJaRHVXbUJTcDNaSHRmVGpqVHV4eEV0WC8xSDdZeVlsM0o2WVJiVHpCUEVWb0EvVmhZREtYMUR5eE5CMGNUZGRxWGw1ZHZNVnp0SzUxN0lEdll1VlRaWHBta09sRUtNYU5DTUVBd0hRWURWUjBPQkJZRUZMdXczcUZZTTRpYXBJcVozcjY5NjYvYXl5U3JNQThHQTFVZEV3RUIvd1FGTUFNQkFmOHdEZ1lEVlIwUEFRSC9CQVFEQWdFR01Bb0dDQ3FHU000OUJBTURBMmdBTUdVQ01RQ0Q2Y0hFRmw0YVhUUVkyZTN2OUd3T0FFWkx1Tit5UmhIRkQvM21lb3locG12T3dnUFVuUFdUeG5TNGF0K3FJeFVDTUcxbWloREsxQTNVVDgyTlF6NjBpbU9sTTI3amJkb1h0MlFmeUZNbStZaGlkRGtMRjF2TFVhZ002QmdENTZLeUtBPT0iXX0.eyJ0cmFuc2FjdGlvbklkIjoiMjAwMDAwMTAxMjE2NTA1NCIsIm9yaWdpbmFsVHJhbnNhY3Rpb25JZCI6IjIwMDAwMDEwMTIxNjUwNTQiLCJidW5kbGVJZCI6ImNvbS5meDE2OC5Db05FVFZQTjEuQ29ORVRWUE4xIiwicHJvZHVjdElkIjoiMDA2IiwicHVyY2hhc2VEYXRlIjoxNzU3OTUwMTQ5MDAwLCJvcmlnaW5hbFB1cmNoYXNlRGF0ZSI6MTc1Nzk1MDE0OTAwMCwicXVhbnRpdHkiOjEsInR5cGUiOiJOb24tUmVuZXdpbmcgU3Vic2NyaXB0aW9uIiwiZGV2aWNlVmVyaWZpY2F0aW9uIjoiRUpRdFBCMFFaNzQzSVIxYy9jSWxoaVdUY2M4NFdCUEozVzdGNENlcURIeVZ6YTRKN3B0VWNxUWh5VHdITzgySCIsImRldmljZVZlcmlmaWNhdGlvbk5vbmNlIjoiM2YwODk2MWItYzZkYi00YjNkLTlmZmUtMDlhNmJhNTg2ZTBjIiwiaW5BcHBPd25lcnNoaXBUeXBlIjoiUFVSQ0hBU0VEIiwic2lnbmVkRGF0ZSI6MTc1Nzk4ODU5ODk1MiwiZW52aXJvbm1lbnQiOiJTYW5kYm94IiwidHJhbnNhY3Rpb25SZWFzb24iOiJQVVJDSEFTRSIsInN0b3JlZnJvbnQiOiJDQU4iLCJzdG9yZWZyb250SWQiOiIxNDM0NTUiLCJwcmljZSI6NTk5OTAsImN1cnJlbmN5IjoiQ0FEIiwiYXBwVHJhbnNhY3Rpb25JZCI6IjcwNDg1MzU0NzMzMDgwOTIxNyJ9.yzacMy0KdCY3W5zA9Xjzf68XWZw9iBNgk0NWepwBspx6iK5gtDpAgTw3DMiXjlah4sX5YmFKCOgANZPKwvHQJA\neyJhbGciOiJFUzI1NiIsIng1YyI6WyJNSUlFTURDQ0E3YWdBd0lCQWdJUWZUbGZkMGZOdkZXdnpDMVlJQU5zWGpBS0JnZ3Foa2pPUFFRREF6QjFNVVF3UWdZRFZRUURERHRCY0hCc1pTQlhiM0pzWkhkcFpHVWdSR1YyWld4dmNHVnlJRkpsYkdGMGFXOXVjeUJEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURUxNQWtHQTFVRUN3d0NSell4RXpBUkJnTlZCQW9NQ2tGd2NHeGxJRWx1WXk0eEN6QUpCZ05WQkFZVEFsVlRNQjRYRFRJek1Ea3hNakU1TlRFMU0xb1hEVEkxTVRBeE1URTVOVEUxTWxvd2daSXhRREErQmdOVkJBTU1OMUJ5YjJRZ1JVTkRJRTFoWXlCQmNIQWdVM1J2Y21VZ1lXNWtJR2xVZFc1bGN5QlRkRzl5WlNCU1pXTmxhWEIwSUZOcFoyNXBibWN4TERBcUJnTlZCQXNNSTBGd2NHeGxJRmR2Y214a2QybGtaU0JFWlhabGJHOXdaWElnVW1Wc1lYUnBiMjV6TVJNd0VRWURWUVFLREFwQmNIQnNaU0JKYm1NdU1Rc3dDUVlEVlFRR0V3SlZVekJaTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEEwSUFCRUZFWWUvSnFUcXlRdi9kdFhrYXVESENTY1YxMjlGWVJWLzB4aUIyNG5DUWt6UWYzYXNISk9OUjVyMFJBMGFMdko0MzJoeTFTWk1vdXZ5ZnBtMjZqWFNqZ2dJSU1JSUNCREFNQmdOVkhSTUJBZjhFQWpBQU1COEdBMVVkSXdRWU1CYUFGRDh2bENOUjAxREptaWc5N2JCODVjK2xrR0taTUhBR0NDc0dBUVVGQndFQkJHUXdZakF0QmdnckJnRUZCUWN3QW9ZaGFIUjBjRG92TDJObGNuUnpMbUZ3Y0d4bExtTnZiUzkzZDJSeVp6WXVaR1Z5TURFR0NDc0dBUVVGQnpBQmhpVm9kSFJ3T2k4dmIyTnpjQzVoY0hCc1pTNWpiMjB2YjJOemNEQXpMWGQzWkhKbk5qQXlNSUlCSGdZRFZSMGdCSUlCRlRDQ0FSRXdnZ0VOQmdvcWhraUc5Mk5rQlFZQk1JSCtNSUhEQmdnckJnRUZCUWNDQWpDQnRneUJzMUpsYkdsaGJtTmxJRzl1SUhSb2FYTWdZMlZ5ZEdsbWFXTmhkR1VnWW5rZ1lXNTVJSEJoY25SNUlHRnpjM1Z0WlhNZ1lXTmpaWEIwWVc1alpTQnZaaUIwYUdVZ2RHaGxiaUJoY0hCc2FXTmhZbXhsSUhOMFlXNWtZWEprSUhSbGNtMXpJR0Z1WkNCamIyNWthWFJwYjI1eklHOW1JSFZ6WlN3Z1kyVnlkR2xtYVdOaGRHVWdjRzlzYVdONUlHRnVaQ0JqWlhKMGFXWnBZMkYwYVc5dUlIQnlZV04wYVdObElITjBZWFJsYldWdWRITXVNRFlHQ0NzR0FRVUZCd0lCRmlwb2RIUndPaTh2ZDNkM0xtRndjR3hsTG1OdmJTOWpaWEowYVdacFkyRjBaV0YxZEdodmNtbDBlUzh3SFFZRFZSME9CQllFRkFNczhQanM2VmhXR1FsekUyWk9FK0dYNE9vL01BNEdBMVVkRHdFQi93UUVBd0lIZ0RBUUJnb3Foa2lHOTJOa0Jnc0JCQUlGQURBS0JnZ3Foa2pPUFFRREF3Tm9BREJsQWpFQTh5Uk5kc2twNTA2REZkUExnaExMSndBdjVKOGhCR0xhSThERXhkY1BYK2FCS2pqTzhlVW85S3BmcGNOWVVZNVlBakFQWG1NWEVaTCtRMDJhZHJtbXNoTnh6M05uS20rb3VRd1U3dkJUbjBMdmxNN3ZwczJZc2xWVGFtUllMNGFTczVrPSIsIk1JSURGakNDQXB5Z0F3SUJBZ0lVSXNHaFJ3cDBjMm52VTRZU3ljYWZQVGp6Yk5jd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NakV3TXpFM01qQXpOekV3V2hjTk16WXdNekU1TURBd01EQXdXakIxTVVRd1FnWURWUVFERER0QmNIQnNaU0JYYjNKc1pIZHBaR1VnUkdWMlpXeHZjR1Z5SUZKbGJHRjBhVzl1Y3lCRFpYSjBhV1pwWTJGMGFXOXVJRUYxZEdodmNtbDBlVEVMTUFrR0ExVUVDd3dDUnpZeEV6QVJCZ05WQkFvTUNrRndjR3hsSUVsdVl5NHhDekFKQmdOVkJBWVRBbFZUTUhZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUNJRFlnQUVic1FLQzk0UHJsV21aWG5YZ3R4emRWSkw4VDBTR1luZ0RSR3BuZ24zTjZQVDhKTUViN0ZEaTRiQm1QaENuWjMvc3E2UEYvY0djS1hXc0w1dk90ZVJoeUo0NXgzQVNQN2NPQithYW85MGZjcHhTdi9FWkZibmlBYk5nWkdoSWhwSW80SDZNSUgzTUJJR0ExVWRFd0VCL3dRSU1BWUJBZjhDQVFBd0h3WURWUjBqQkJnd0ZvQVV1N0Rlb1ZnemlKcWtpcG5ldnIzcnI5ckxKS3N3UmdZSUt3WUJCUVVIQVFFRU9qQTRNRFlHQ0NzR0FRVUZCekFCaGlwb2RIUndPaTh2YjJOemNDNWhjSEJzWlM1amIyMHZiMk56Y0RBekxXRndjR3hsY205dmRHTmhaek13TndZRFZSMGZCREF3TGpBc29DcWdLSVltYUhSMGNEb3ZMMk55YkM1aGNIQnNaUzVqYjIwdllYQndiR1Z5YjI5MFkyRm5NeTVqY213d0hRWURWUjBPQkJZRUZEOHZsQ05SMDFESm1pZzk3YkI4NWMrbGtHS1pNQTRHQTFVZER3RUIvd1FFQXdJQkJqQVFCZ29xaGtpRzkyTmtCZ0lCQkFJRkFEQUtCZ2dxaGtqT1BRUURBd05vQURCbEFqQkFYaFNxNUl5S29nTUNQdHc0OTBCYUI2NzdDYUVHSlh1ZlFCL0VxWkdkNkNTamlDdE9udU1UYlhWWG14eGN4ZmtDTVFEVFNQeGFyWlh2TnJreFUzVGtVTUkzM3l6dkZWVlJUNHd4V0pDOTk0T3NkY1o0K1JHTnNZRHlSNWdtZHIwbkRHZz0iLCJNSUlDUXpDQ0FjbWdBd0lCQWdJSUxjWDhpTkxGUzVVd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NVFF3TkRNd01UZ3hPVEEyV2hjTk16a3dORE13TVRneE9UQTJXakJuTVJzd0dRWURWUVFEREJKQmNIQnNaU0JTYjI5MElFTkJJQzBnUnpNeEpqQWtCZ05WQkFzTUhVRndjR3hsSUVObGNuUnBabWxqWVhScGIyNGdRWFYwYUc5eWFYUjVNUk13RVFZRFZRUUtEQXBCY0hCc1pTQkpibU11TVFzd0NRWURWUVFHRXdKVlV6QjJNQkFHQnlxR1NNNDlBZ0VHQlN1QkJBQWlBMklBQkpqcEx6MUFjcVR0a3lKeWdSTWMzUkNWOGNXalRuSGNGQmJaRHVXbUJTcDNaSHRmVGpqVHV4eEV0WC8xSDdZeVlsM0o2WVJiVHpCUEVWb0EvVmhZREtYMUR5eE5CMGNUZGRxWGw1ZHZNVnp0SzUxN0lEdll1VlRaWHBta09sRUtNYU5DTUVBd0hRWURWUjBPQkJZRUZMdXczcUZZTTRpYXBJcVozcjY5NjYvYXl5U3JNQThHQTFVZEV3RUIvd1FGTUFNQkFmOHdEZ1lEVlIwUEFRSC9CQVFEQWdFR01Bb0dDQ3FHU000OUJBTURBMmdBTUdVQ01RQ0Q2Y0hFRmw0YVhUUVkyZTN2OUd3T0FFWkx1Tit5UmhIRkQvM21lb3locG12T3dnUFVuUFdUeG5TNGF0K3FJeFVDTUcxbWloREsxQTNVVDgyTlF6NjBpbU9sTTI3amJkb1h0MlFmeUZNbStZaGlkRGtMRjF2TFVhZ002QmdENTZLeUtBPT0iXX0.eyJ0cmFuc2FjdGlvbklkIjoiMjAwMDAwMTAxMjE2NDc1NiIsIm9yaWdpbmFsVHJhbnNhY3Rpb25JZCI6IjIwMDAwMDEwMTIxNjQ3NTYiLCJ3ZWJPcmRlckxpbmVJdGVtSWQiOiIyMDAwMDAwMTExOTY1NTUxIiwiYnVuZGxlSWQiOiJjb20uZngxNjguQ29ORVRWUE4xLkNvTkVUVlBOMSIsInByb2R1Y3RJZCI6IjAwMiIsInN1YnNjcmlwdGlvbkdyb3VwSWRlbnRpZmllciI6IjIxNjU0MzMzIiwicHVyY2hhc2VEYXRlIjoxNzU3OTUwMTExMDAwLCJvcmlnaW5hbFB1cmNoYXNlRGF0ZSI6MTc1Nzk1MDExMjAwMCwiZXhwaXJlc0RhdGUiOjE3NTc5OTMzMTEwMDAsInF1YW50aXR5IjoxLCJ0eXBlIjoiQXV0by1SZW5ld2FibGUgU3Vic2NyaXB0aW9uIiwiZGV2aWNlVmVyaWZpY2F0aW9uIjoiOGpQS2w1Q2swVlRaMjlNeUphWFh6dU9zaVZpWHR6TFN2YnJWL1pycy9SeEYzQ3ZFOEpOempKeGRBN3pzUURISyIsImRldmljZVZlcmlmaWNhdGlvbk5vbmNlIjoiNjI5YzA3OGYtMzM0MC00M2E3LTlkMGYtOGNkMTQ2YWY3MzZkIiwiaW5BcHBPd25lcnNoaXBUeXBlIjoiUFVSQ0hBU0VEIiwic2lnbmVkRGF0ZSI6MTc1Nzk4ODU5OTUyNywiZW52aXJvbm1lbnQiOiJTYW5kYm94IiwidHJhbnNhY3Rpb25SZWFzb24iOiJQVVJDSEFTRSIsInN0b3JlZnJvbnQiOiJDQU4iLCJzdG9yZWZyb250SWQiOiIxNDM0NTUiLCJwcmljZSI6Mzk5OTAsImN1cnJlbmN5IjoiQ0FEIiwiYXBwVHJhbnNhY3Rpb25JZCI6IjcwNDg1MzU0NzMzMDgwOTIxNyJ9.CJQtH4wt5-D8PSLbWSms0XRjFXGm8bm5WEzC5FfHruj254tnzYPSKEbmRVQo4-wMVAkiVyH2eWZWq-hHYHTHLA"
    appleReceipt(jws, '0x3eE8b6034611A09d8370F515D9a68e90a3AebeB6','2UbwygKpWguH6miUbDro8SNYKdA66qXGdqqvD6diuw3q')
    // aplleStoreObjPool.push({
    //     to: '0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff',
    //     solana: '2UbwygKpWguH6miUbDro8SNYKdA66qXGdqqvD6diuw3q',
    //     plan: '299',
    //     transactionId: '000199999901',
    //     restore: true
    // })


    // aplleStoreObjProcess()
}

// test()