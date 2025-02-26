import {ethers} from 'ethers'
import oldGuardianABI from '../util/CGPNs.json'
import {logger} from '../util/logger'
import referralsV3ABI from './ReferralsV3.json'
import {mapLimit} from 'async'
import Colors, { blue } from 'colors/safe'
import { masterSetup } from '../util/util'
import CGPNsV7ABI from './CGPNsV7.json'
import {abi as CONET_Point_ABI} from '../util/conet-point.json'
import newCNTPABI from './cCNTPv7.json'
import { inspect } from 'util'
//const oldProvider = new ethers.JsonRpcProvider('http://212.227.243.233:8000')

const oldGuardianNFTAddr = '0x453701b80324C44366B34d167D40bcE2d67D6047'
// const oldGuardianContract = new ethers.Contract(oldGuardianNFTAddr, oldGuardianABI, oldProvider)
const referralsV3Addr ='0x1b104BCBa6870D518bC57B5AF97904fBD1030681'
const oldReff = '0x8f6be4704a3735024F4D2CBC5BAC3722c0C8a0BD'
// const referralsContract = new ethers.Contract(oldReff, referralsV3ABI, oldProvider)

const newRPCPublic = 'https://rpc.conet.network'
const newRPC = new ethers.JsonRpcProvider(newRPCPublic)
const managerWallet = new ethers.Wallet(masterSetup.guardianBuyADMIN[0], newRPC)


const CGPNsV8addr_old = '0xc3e210034868e8d739feE46ac5D1b1953895C87E'

const newGuardianNodes = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'

const cCNTPAddr = '0xa4b389994A591735332A67f3561D60ce96409347'
const cCNTPOldAddr = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'

// const oldCntpContract =new ethers.Contract(cCNTPOldAddr, CONET_Point_ABI, oldProvider)

const GuardianNFTV7Contract = new ethers.Contract(newGuardianNodes, CGPNsV7ABI, managerWallet)

const newCNTPContract = new ethers.Contract(cCNTPAddr, newCNTPABI, managerWallet)
const newCNTPContractread = new ethers.Contract(cCNTPAddr, newCNTPABI, newRPC)
//		856 

// logger(inspect(masterSetup.initManager, false, 3, true))
// logger(managerWallet.address)
const start = async () => {
	let boostersNumberArray: string[]
	let nodeAddressArray: string[]
	let nodeReferrerAddressArray: string[]
	let referrerNodesNumber: string[]
	// [nodeAddressArray, boostersNumberArray, nodeReferrerAddressArray, referrerNodesNumber] = await oldGuardianContract.getAllIdOwnershipAndBooster()
	// logger(inspect(referrerNodesNumber, false, 3, true))
	//[nodeAddressArray, boostersNumberArray, nodeReferrerAddressArray, referrerNodesNumber] = await GuardianNFTV4Contract.getAllIdOwnershipAndBooster()

	//			Restore Node's CNTP

	// const _nodeArray = nodeAddressArray
	// const nodeArray = _nodeArray.map(n => n)
	// // logger(inspect(nodeArray, false, 3, true))
	
	// logger(Colors.green(`${nodeArray.length}`))
	// let iii = 0
	// await mapLimit(nodeArray, 10, async (n: any) => {
	// 	const y = n.toLowerCase()
		
	// 	const balance = await oldCntpContract.balanceOf(y)
	// 	const hasInit = await newCNTPContractread.balanceOf(y)
	// 	logger(Colors.blue (`${n} Old balancd = [${ethers.formatEther(balance)}] new Balance ${ethers.formatEther(hasInit)}`))
	// 	// if (!hasInit) {
	// 	// 	const tx = await newCNTPContract.initAccount(n, balance)
	// 	// 	if (y === '0x9824fdf7bde5821e5d5ba43daa1615f9c980f3ce' || y === '0xf01974341104ec97e1451b8c103d31a21f539717') {
	// 	// 		logger(Colors.magenta(`${n} = ${ethers.formatEther(balance)} ${tx.hash}`))
	// 	// 	} else {
	// 	// 		logger(Colors.blue(`${n} = ${ethers.formatEther(balance)} ${tx.hash}`))
	// 	// 	}
	// 	// }
	// 	++iii
	// 	// logger(Colors.grey(`[${iii}] ${y} [${ethers.formatEther(balance)}] hasInit [${hasInit}]`))
	// }, err => {
	// 	if (err) {
	// 		return logger(err)
	// 	}
	// 	logger('success')
	// })

	


	//			Restore nodeAddressArray
	// const _nodeArray = nodeAddressArray.slice(600)
	// const nodeArray = _nodeArray.map(n => n)
	// logger(inspect(nodeArray, false, 3, true))
	
	// const tt= await GuardianNFTV7Contract.mintNodeBatch(nodeArray)

	// logger(inspect(tt.hash, false, 3, true))

					//	Restore boostersNumberArray
	// logger(inspect(boostersNumberArray, false, 3, true))
	// const boostersArray = boostersNumberArray.map(n => n)
	// await GuardianNFTV7Contract.nodeIdBoosterBatch(boostersArray)


	//				Restore mintREFERRER NFTs
	// logger(inspect(nodeReferrerAddressArray, false, 3, true))
	// const referrerArray: Map<string, number> = new Map()
	// nodeReferrerAddressArray.forEach(n => {
	// 	if (n !== '0x0000000000000000000000000000000000000000') {
	// 		referrerArray.set(n, 1)
	// 	}
	// })

	// logger(inspect(referrerArray.keys(), false, 3, true))
	// const referrers: string[] = []
	// const IDs: string[] = []
	// referrerArray.forEach((v, key) => {
	// 	referrers.push(key)
	// 	IDs.push('2')
	// })

	// const balance: number[] = await oldGuardianContract.balanceOfBatch(referrers, IDs)
	// const NFTs = balance.map(n => n.toString())
	// await GuardianNFTV7Contract.mintREFERRER_NFTBatch(referrers, NFTs)

			// nodeReferrerAddressBatch
	// const referrerAddressArray = nodeReferrerAddressArray.map(n => n)
	// await GuardianNFTV7Contract.nodeReferrerAddressBatch(referrerAddressArray)


	// const referrerArray: Map<string, number> = new Map()
	// nodeReferrerAddressArray.forEach(n => {
	// 	if (n !== '0x0000000000000000000000000000000000000000') {
	// 		referrerArray.set(n, 1)
	// 	}
	// })
	// const owners:Map<string, boolean> = new Map()
	// mapLimit(referrerArray.keys(), 5, async (n, next) => {
	// 	const _referrers: string[] = await referralsContract.getReferees(n)
		
	// 	const referrers: string[] = _referrers.map(n => n)
	// 	referrers.forEach(n => {
	// 		if (n !== '0x0000000000000000000000000000000000000000') {
	// 			owners.set(n, true)
	// 		}
			
	// 	})
		
	// 	// await mapLimit(owners.keys(), 1, async (nn, next) => {
	// 	// 	await referralsContract.initAddReferrer(n, nn)
	// 	// })
		
	// }, async err => {
		
	// 	const uu: string[] = []
	// 	owners.forEach((v,key) => {
	// 		uu.push(key)
	// 	})

	// 	let i = 0
	// 	logger(JSON.stringify(uu))
	// 	mapLimit(uu, 1, async (n, next) => {

	// 		const Referrer = await referralsContract.getReferrer(n)
	// 		logger(Colors.blue(`${i} Referrer ${Referrer}`))
	// 		if (Referrer !== '0x0000000000000000000000000000000000000000') {
	// 			logger(`initAddReferrer `)
	// 			await referralsContract.initAddReferrer(Referrer, n)
	// 		} else {
	// 			logger(`owners [${n}] has Referrer 0x0000000000000000000000000000000000000000`)
	// 		}
	// 		i++
	// 	}, () => {
	// 		logger(`success!`)
	// 	})
	// })


	const reffers = `["0xfEc7583160D24b2b77F51EafD9B024EaCAd8066a","0xb8466Ddd33406E802a2032c279b6EE0e883eFB65","0x8ab7B4BfE50738a8793735E7EB6948a0c7BAC9Ee","0x8FCb191a4e40D0AFA37B2fa610377688992f057f","0xB83c61630F21369aCd4090e8Ff8c8FD3eaad2515","0x91D4B9A6cf8D74cF3900B4D62Dcd193f9d8AD5cd","0xCBEBB9daCd4004EAeaBB3EA703a34706bea8a096","0xBB24bE9990b738BB37DDDFa18c1aC2D19b755585","0x3755E149D312E7769Bb373f3375967D69e2Dfc50","0xC49680AE052F9e21DA3870551cf5c1D6021e2B01","0x5C809C34112911199e748B0d70173Acb18E5533a","0xf9DFD10d7c636b1156283400128c930F9d79f14F","0x3b494e206788BEbaBa160F17Be231Dfdc27eB426","0xee4968CE3ea76C20A8083f3B0710cc199EC5bD94","0x56879902af70ce7149Ba12efa32928f6abda00Cd","0x3ED64D9393BA19bDD216414671779d416eaE3cCe","0xcbc4dF654B1031593B7eac468fCfc9c9745066e2","0xeFC8ab10Af53e8a51866394EE5872ea91F712A0D","0x29672fAa9b0670d4f81d1053f13DAD176Aae35a7","0xC4312788113A427b6dE474B8ef89500837501028","0x2e6dd1C3d8F28179D190D3410E0ce80E32b73c94","0xBA7b761392146E4e2C3Ae8dD60597e74084D0228","0x0466dC6cF0d7f3bd2205DabEe82b04b7093aA27B","0x136a93ce0DfD5615591E512C775f71B946Db5Ff2","0xB596cfcC55db4536DA5307Dbbb49C1917Ae36381","0xEfaaCDB94A923e5cC843BE5b7D8308B7F3Ec8d65","0xdF62baa44E9a672DFce3b7D607775488CDb94BB0","0xd08644785cEE0F4156E0Acd50f631b0A8E9772a7","0x63eA268eAc0CAB43B70424575c33e1a9dbe70615","0x71135E108688eba987348606f2EE9867927b494D","0x561e9A11B3D11d237e2FD8ddd29926aE97933Aa7","0x848b08302bF95DE9a1BF6be988c9D9Ef5616c4eF","0xCb872981EC9C2A11fE614C6F04D4d533df02BF4F","0x89d110488C014681d3e9EEFC8dB68b9B7FE85bfC","0x98a4dDc2167CB31C53a91260083c10506B7815EA","0x68B90eC2E79A59A6cDD62C92E57dC447bdB29308","0x67210Ad83d853305D00ddd7e7a273fF4F223Ae7D","0x00875bE88C47Ee6f7fe65E686205920e6C2baaE4","0x78751c30653dD628C458a18f9eC36fd9Afd0f953","0xE92e7e520361BD3b0097d854a84dc9a7Ac06B706","0x35DEcFbe5Fb3d5B60826302149Eac9E6DA79d651","0x534062330EeA9720898E9dA6Af11E94195Fa7442","0x2900A19f02Fba8Dd5397f6b04B56911F41AA2998","0xefdaA48BB1961AEfBF6d0295ea96FB034543995c","0xd6793Ee79620A9802138ABd200354f0131A338e0","0x6d6C741B3b1B6eB95caCC43AA9e31d41a2bD2218","0xcCaa9b2C717eb607b43aAAdc3c19b0D1640047b9","0x9CDB332A4384343Fa23A5e8b565580fC59552637","0xcF6AD29f268f4B62a0c2d0CB9816d46e4a0F1f94","0xDDb7Ddfe5E493A131487F2239dBCa41b0136EEf3","0x83e34754c139Ffb1e31a4979fE86AD009C828eD7","0x2C689d1657C19ffCCa28f10490eD9BF3C69f58d0","0x9769e1b5237C415d71a6D58289701D3f274F59d9","0x98b0d64B6492589ea30C014aA4AA3Fdc2c69Bb64","0x8AD17A0E7F2725b7A073E5D4e1f053e9d53041fD","0x48f636c19CCf02c975D7aE754dC3C0A3c5515C73","0xF3e6529dCdD16ebe9F8808F261aEdaa368016568","0x967B11540B7b0F891E01Aae8509Ec9fecF34b942","0x37a2291278a5Bf7975365A6391A8EB1D4d828bDa","0x1ff8BDCd1d5C1496a8a003038Bc95993d0F30045","0x815b0545C98eFC32e293e176c86CbB56f681B026","0x204f3c5fe58D51dc24faB6AC26797597a5a41F2f","0x1EC4b8707FbD7B009e85e22dd77f546EaE9A8cB8","0x6C13339dF37027CDE88D0DCd6B8E9850809EDA52","0x6d379cB771E9dCd07Bab444456C2fa68b4e9982d","0xCdBeC699fa1bbbE38292585E2F3c19BC40A050A6","0x0d5a2e94b99894BB71E537dAf66CF78D76f24147","0x443F26cfb28ad70f4E0Ae7CB1333d2B0a009C6aA","0xd46997588b5E7f2C1B60628E692763743dDA9a49","0x609A656EAB159f808dE6DCf1FDB83b32e479da5e","0x0D4C91541400beD3AC4e1315aAA647030FF035Ea","0xd5dce3AC55C2F3209132d3e42EBd03B7b9C3d751","0x9074ED9799819b8ac09530a1f200F63262570859","0x9C591b2eB64597DB03F5A9b8DAD620297618CaDf","0x0dc8c4216db8f3Af653Db450872a2F1BEaaC032F","0x96E16216DdD7e11Ee800F93fA0208bcB4Cb2b1EA","0x46Bc4488a0303f1Cf8d139656A8c0934430b6971","0xDF52Eef44421ca6f8CB87EFff165f76aEa37F8Cc","0x9829C976Cb1E9641Ce00759D632eA1a37d115F11","0x478B57e21CD8b75Abcee75A8cA44160Cc682eEf0","0xd1a5ACC6474d6AEfEd25f79aE21fEFBb3f186CA9","0x81bfBcdF3D3bC7d9237668D9b1c2F536b81cAc0a","0x5FA304F9C8Eb5BB55abcfAFBA2196149CF537463","0xfb8DF4964D49C8DeD1c34E90cbed41432aC5B4Bc","0x1a87fc28adFC5b511c5E97c7c8CEEb74320A2D1f","0x54E300038BF356B94F31877E1F59D7ef6E98285F","0x95175d9944AFEAB3A627A8Ce852F565f76Da0ae5","0x5717bA1d310f27C7563279C8c9E8917ba272FD22","0x2988114084A9aF2F1378D5e8f68e2Cc1B3FC774a","0xBd0c11A07A55378e90FCC00da49E663D6E1Ee896","0x3870028c825367432990403D117F8DAA9153c012","0x562E1893A154bb3fBC0AcFB42826F231669f2529","0x31544000682920FC50CAD3060156FAEFB4232987","0x2ED8322E870afC207a956d9F6bc63aE908B297e7","0x33A4d947797022010CfdFfD6c144711ad2BFAeae","0x2796c4c4161Af2915f9627cCF7D3ff0FBc3583ea","0xadDe9EC6e7429bc2F9c4Cfb40f0F067c7871Cb5c","0xd170B9d3b190654c2fEf3F0F831eDaAcA6c46DaE","0x4CD2f8Ae20534510728C4A1B806059D2725c2684","0xf9D9abA1Df6abD42f03bbdf080684ac5d8f51225","0xcc624F30775Da2ad15CB76dD727863c24D796861","0x04dA1eb9E11a79C756669741EDA149b7FAC3942E","0x159747109F31bff02fCB311f68b94D7bB9b822f4","0x9EFcD851A2c5cAE20dfEfb622F899ecfaea1dfc3","0x5944e934a110fE3D2deDeBD6b65eE8EF355b5F11","0x04534971487dA41C1b46D972415e4295CDB897e4","0xA2DB13aDCc1B886F137f18F9a86C366931e4002c","0x7A32241AD94B25966DF545B326dbE519Da517050","0xcDb428F5f457fbFdEF6846BE1d06B0769C47f47e","0x9FC9419A556b8f9e28B6894D0eC39f9E03666A2a","0xf8B8Ff960AA57d58a44fBb8Bd63F44D0594D8a2B","0x81bD23e001b9F7BeB65FdbACA24787E3f04763a9","0x5B2B6f14626037658EDA2F39a0f239fE0FB52CB6","0x3a9079c9d286a8fc029f48040Ee05cc737a8e92f","0x1226b1d278092b9abedadA1d90AFAcE5e5EBBa59","0x9fD6a7CfD6814e02b3ba7A492d3b7eaC522017Bd","0xc1878e0A8Bfd13984db0D14652D83185Bb52cbd8","0xaaa0c06C37883286382EbC7a2C1059b41D9D063e","0x199A23f7eE89c97d9D1CC98d19b1F2e6350B9E56","0x083d5441DcBEFcaD62807383f0C6F7399eE1cB83","0x0a0302C585978a5F1A7107e0E74212F0dF763fdB","0x9957ae4ABE855094dB47C31CE4d5B10E796A6Ef9","0x8983aD3F14895eE966bd7B84214597fa87347aA2","0x61B473D2537958f887325064CdecF51CCf0D596a","0xC44Bfd56F3516D0082E0a39f3c7cC81c9Cd5C534","0x256EEA9dE5F11ad43f851CC4b6DE307F5D13519B","0x19fD02AC0c837Dd9645eC90783FeF06426143734","0x42a1530e8302437557a4515F4AD1A572d47cfC5F","0xF27d93Bf7c4C0720418DCCd367caB4D31562e0E7","0x50b06bFD5AaD6CB8C9B4f6d34ecf78FC4C3cE631","0xbb1F0fe62dBec773A467c425F6687e3329Ac1D25","0xB7d55C719A06a4Bc8515EF05a3F9dfe741C77704","0x0f609A574203Bad5A788F42bb7f866aB5Ada7c89","0xa0e80d35e9c20f34e4e82BAd51671303457E0Ca7","0xE7f5768F6D153c8146c863A482c4e5A89c36D2B2","0x993b85B854Cf63D380D0340aD7356c2DCf9feBC5","0x45105d3d1d8beFb0E7df7025540733f4c19f81E1","0xEBF172Af0BD157751da52F4b09E76323A765A2fB","0x731ef8175A4c77a946bF7af0495191Ef16C3673f","0x9ab8603a20392AD1C3a6880519585506E8624740","0x0f42c9763789673aA5AD2E178cD854E05ED01DF8","0xF05B265748D66012ffFB8aFd1C2c7dd288b55c36","0xc34c5676343f8632e9ea4690e2A81bC4B72bFb42","0x78627681017f4eb626C57d77B34d7A1bEE7C7807","0x6D4489D62829Ff5BA0C3Ff69B021E78d4992F068","0xcd31AbD90a327a6b2b3452Ece41f1164d766625E","0xbF933ADd4A5199B4fd270aD06d550cEBD637cEa8","0x275a7F93d4e0F494f899acaFF4cEBf3882daAd6C","0x50b9c94F5Fc7a485bCaD94A16Ac73E71989ad3CA","0x189Fc649b8755A32C665874C0ae25D5316057db2","0x2b820BD6DBe8614Eb56E95168583f034174A6fBc","0x93B107A00231019DAfe7A36F486A61f1Cc4e88aF","0x129BbDFa713590DD47b52c6B04a8def56dfCA9E2","0x7381187C6306DE10545741c07944DD7a4B5a05e8","0x9Acc1fa0C501b7b5266E2421f4CD88CB14F12dDA","0xD9e0EcF80c55075781C1Ad830cB733f0b7a0ae07","0x5FAf0235bE908Dc5aaD6ca8B31Cb742F6E613Ea7","0x98b68D2aF1fEFAf1BC388EC25911a640299067B0","0x5ac372C490F635301F13d5E4C3Cb1d9a394be5fb","0xB8B1aa9A85e79E734355E6F353cAEBd0df34F9F3","0x739DDc9Cf07303418481e6dE0e1Efa96a7eFaA4E","0xb439D4A5f796f0eD5F4567F612a006575BbeD033","0x56C40Ee6d06ed76f33ceeb7239208A04eE2601d1","0xeb7D6a41220d027B396631F1F7eED2E29d784c18","0xf0aD312b755B8418440bcC176a4D47361a8F4F43","0x8B859081fC24c5063a7969caa0CE5c6303dc97EE","0x5B0A31a3C08c8FD9a351b5F8c8d832Ff18747833","0x1b56d04cc4dF8d10C222c9Ca5B042a22972659BA","0xCb512570cB7576e5F9037b28fcf0a9b0D13708c9","0x2d53b71D0a44e80a21a1883002DeB81b84D154de","0x95EaB065A86Ce4f67c615043F05c3e20812711A8","0xa11268d2E9F6e933266Fa6Fd4bFB97d632F6F1d4","0xF92877193D605100D0bb19d3621F017A89AA6803","0x5FFb99C0eF750E6BC8e5Ed32D45DF1B6C0a4CE08","0x59b258fA9C9b45E267291d9fbA45a3f07E90F78d","0xF8243B30a56975AB595bF740b151A339CB1110Ce","0x85dEAB7F2D9008d1C159286d653B0169F9548A67","0x5C569696c8c5BeB21AE43CAbd0B10FD3a4EeCc4b","0x69A07e9C8E694C68ce4036194F04C89CcbBE87Ae","0xcf62E8e14E72B864ABFAB11A73349B5450e687cC","0x3f252995A6a3b65f078b0BE77b2CeFE5f3049f94","0x097DbdFbB3907C12c2f686EF6dF6c5638AF274D5","0x67982BE85Db46954F99625C8B1b5083E0D081997","0x42F8B3C985Df3Df44b1DB21e42CcdC4BAd9361D7","0xFea38A0e780A12417A045C6aF36d857870e4369A","0xeD1556643e5847ad3AE820B400eFe4Fa40C4BF46","0x99266996D140BA6838B2614dB08109D3b1DE871a","0x88630D06dD4602E95D27bc797AE7D14047E8143b","0xA62E4Be739d9C58A4f7EBc9D0e8dfcf367CE8BF4","0x55D39f7397F2c1f5faDb3829F5CDb8aCcc107799","0x439318D889D5744a3E1962ef470DEC0267F996dE","0x4049EE128362F0FeBBbaE1f0762a85Fad7100Ef7","0xF8586C4fB70c6294472d78C5DE147C8D6CD1F589","0x272D05F390b642DEd2c966C2eE8B651Ac5e48915","0x0bE81E86695209823da0Cba50CceE997d3125b85","0xd3EFe69fef6A6E23A4224Fa331b5DDa2873D2874","0x2E570bB806c62C3212b3154a410Eb12Fe2D841B7","0xc51fCEbf59b84F347bcA943d3779Ec5E32fBEE5F","0x185D9D76A96784A6ff98C0613930AD2B1F69A8fA","0xdE1c3Fb867B18FD3a5E2eD0b599Fc1b558A73025","0x940768a84449E646490Dbe6f0dcf214fd310D366","0x3114a67B80A7B11f8F3Bc96EC70fdB51AC8F6144","0xbc8D0E7c5D6a1f5CD3126a312DAD1146AFB4F250","0xA626674EDe46C533d381B1A8b27902d3FaB6fC6e","0xDd906A7F80F54c99DB2aF3FAfCb3Cb4295fBC2cB","0x1434384edA398F8F78C55617fcf563f67791Cb73","0x6F7a3542183A73B396677013449D7793BE6290b1","0x3D6a9d3d95a8A828031127FE8c266850c85E6FdA","0x95c1fDe9E465DE5ceB84451B05506fC97f3e37dA","0xa5dEE8703f6AD5b6411330693a574e5FE532e64a","0x489d6443b4D41c28522C8f72fb202d64EFcFc76b","0xBA982467Da9A1Bba450dDD6611918D72B0334F23","0x3aF676057621D965099d75742A1fC3E0e3a8D759","0x931e72934533f3C3eA0727fd5F4f53DCc4E4fC75","0x92c83E8A13c9Ab8919fB46A372d5652D41E13F4e","0x81f627A0c5295D854BFd74d362880e2216704513","0x9729B3Ca24dD4F4e61A51028a72e680Ee6BF252A","0x5d098f359c8Be023ABa4A9DFABD48a96A74cCBe7","0x8c72d7B00Fd2dC175431bcc4230b56ae236A63cA","0xC96d2EBc30a9D06D18474Bd7EC57788ff46a8659","0x91Cd54E1a4bCe2D2A357556D58299925fB5A6d25","0x258CdcAa16B39A89603f41BA8990DA251C19686B","0x2062bD7587493E713a25c0356381bc0D899f7f80","0x3a97E43CA48d41a0C687753568FFE221A7954408","0xcD81057d4ED343c489dfC0650467431e2037AA8a","0x7C126bb4157196D4291E17C513FD67b2125DE5F6","0xCBe736E896F7fd26F54FAec1788cCB195C163Fc5","0x3Fe974097894aD1392A3A48e337b288EA7B79275","0xd747AF247a554578Eb1b94F7b0717265822deDCf","0x20Bd48a530B1c70142cD8d8332501505cE56eaB4","0x4DCAD9ae5363Af4Fa5e210c4727bC7E3075a747e", "0xd8b12054612119e9e45d5deef40edca38d54d3b5"]`
	const res: string[] = JSON.parse(reffers)
	logger(Colors.magenta(`${res.length}`))
	const managerWallet1 = new ethers.Wallet(masterSetup.conetNodeAdmin[0], newRPC)
	const referralsContractNew = new ethers.Contract(referralsV3Addr, referralsV3ABI, managerWallet1)
	let iii = 0
	// mapLimit(res, 1, async (n, next ) => {
	// 	logger(Colors.magenta(n))

	// 	const [referrerBalance, init, Referrer] = await Promise.all([
	// 		oldGuardianContract.balanceOf(n, 2),
	// 		GuardianNFTV7Contract.getREFERRER_Status(n),
	// 		referralsContract.getReferrer(n)
	// 	])


	// 	logger(Colors.blue(`${iii} ${n} ==> mint ${referrerBalance} init = ${init}`))
	// 	// if (referrerBalance > 0 && !init) {
	// 	// 	const tx = await GuardianNFTV7Contract.mintREFERRER_NFT (n, referrerBalance)
	// 	// 	logger(Colors.blue(`${iii} ${n} ==> mint ${referrerBalance} tx=${tx.hash}`))
	// 	// }

	// 	if (Referrer !== '0x0000000000000000000000000000000000000000') {
	// 		logger(`initAddReferrer `)
	// 		await referralsContractNew.initAddReferrer(Referrer, n)
	// 		logger(`initAddReferrer initAddReferrer(${Referrer}, ${n}) `)
	// 	} else {
	// 		logger(`owners [${n}] has Referrer 0x0000000000000000000000000000000000000000`)
	// 	}
	// 	iii++
	// }, (err) => {
	// 	if (err) {
	// 		logger(err)
	// 	} else {
	// 		logger("seccess")
	// 	}
		
	// })

	// const IDs: string [] = res.map(n => '1')

	// const _balance: string[] = await oldGuardianContract.balanceOfBatch(res, IDs)
	// const needAddW: string[] = []
	// const nft1: string[] = []
	// res.forEach((n, i) => {
	// 	const j = _balance[i].toString()
	// 	if (j !=='0' ) {
	// 		needAddW.push(n)
	// 		nft1.push(j)
	// 	}
	// })

	// logger(inspect(nft1, false, 3, true))
	// logger(needAddW.length, nft1.length)


	// await GuardianNFTV4Contract.mintNode_NFTBatch(needAddW, nft1)

	// 	logger(inspect(wallets, false, 3, true))
	// 	logger(inspect(balance.toString(), false, 3, true))
	// 	let i = 0
	// 	let total = 0
	// 	mapLimit(wallets, 1, async (n, next) => {
	// 		const referrer = await referralsContract.getReferrer(n)
	// 		if (referrer !== '0x0000000000000000000000000000000000000000') {
	// 			logger(Colors.blue(`referrer ${n} => ${referrer}`))
	// 			//await referralsContract.initAddReferrer(referrer, n)
	// 		}
	// 		total += parseInt(balance[i].toString())
	// 		i++
	// 	}, err=> {
	// 		logger(`success total = ${total}`)
	// 	})

	// 	// balance.forEach((n,i) => {

	// 	// 	if (n.toString() > '0') {
				
	// 	// 	}
	// 	// })
	// 	// logger(Colors.magenta(`Total owners = [${rnumber1Owners.size}]\n`),inspect(rnumber1Owners.entries(), false, 3, true))

	// })
}


// start()