import type { EventEmitter, WalletName } from '@solana/wallet-adapter-base';
import {
    BaseMessageSignerWalletAdapter,
    scopePollingDetectionStrategy,
    WalletAccountError,
    WalletConnectionError,
    WalletDisconnectedError,
    WalletDisconnectionError,
    WalletNotConnectedError,
    WalletNotReadyError,
    WalletPublicKeyError,
    WalletReadyState,
    WalletSignMessageError,
    WalletSignTransactionError,
} from '@solana/wallet-adapter-base';
import { Transaction } from '@solana/web3.js';
import { PublicKey , VersionedTransaction} from '@solana/web3.js';

const solChain = {t:1,i:0}

/**
 * Base58 ---------------------------
 */
const encoder = new TextEncoder();

function getTypeName(value: any): string {
  const type = typeof value;
  if (type !== "object") {
    return type;
  } else if (value === null) {
    return "null";
  } else {
    if(value?.constructor?.name)
    {
        return value?.constructor?.name
    }
     return "object";
  }
}

export function validateBinaryLike(source: unknown): Uint8Array {
  if (typeof source === "string") {
    return encoder.encode(source);
  } else if (source instanceof Uint8Array) {
    return source;
  } else if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  throw new TypeError(
    `The input must be a Uint8Array, a string, or an ArrayBuffer. Received a value of the type ${
      getTypeName(source)
    }.`,
  );
}


// deno-fmt-ignore
const mapBase58: Record<string, number> = {
  "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "8": 7, "9": 8, A: 9,
  B: 10, C: 11, D: 12, E: 13, F: 14, G: 15, H: 16, J: 17, K: 18, L: 19, M: 20,
  N: 21, P: 22, Q: 23, R: 24, S: 25, T: 26, U: 27, V: 28, W: 29, X: 30, Y: 31,
  Z: 32, a: 33, b: 34, c: 35, d: 36, e: 37, f: 38, g: 39, h: 40, i: 41, j: 42,
  k: 43, m: 44, n: 45, o: 46, p: 47, q: 48, r: 49, s: 50, t: 51, u: 52, v: 53,
  w: 54, x: 55, y: 56, z: 57
};

const base58alphabet =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".split("");

/**
 * Converts data into a base58-encoded string.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/draft-msporny-base58-03#section-3}
 *
 * @param data The data to encode.
 * @returns The base58-encoded string.
 *
 * @example
 * ```ts
 * import { encodeBase58 } from "https://deno.land/std@$STD_VERSION/encoding/base58.ts";
 *
 * encodeBase58("Hello World!"); // "2NEpo7TZRRrLZSi2U"
 * ```
 */
export function encodeBase58(data: ArrayBuffer | Uint8Array | string): string {
  const uint8tData = validateBinaryLike(data);

  let length = 0;
  let zeroes = 0;

  // Counting leading zeroes
  let index = 0;
  while (uint8tData[index] === 0) {
    zeroes++;
    index++;
  }

  const notZeroUint8Data = uint8tData.slice(index);

  const size = Math.round((uint8tData.length * 138) / 100 + 1);
  const b58Encoding: number[] = [];

  notZeroUint8Data.forEach((byte) => {
    let i = 0;
    let carry = byte;

    for (
      let reverseIterator = size - 1;
      (carry > 0 || i < length) && reverseIterator !== -1;
      reverseIterator--, i++
    ) {
      carry += (b58Encoding[reverseIterator] || 0) * 256;
      b58Encoding[reverseIterator] = Math.round(carry % 58);
      carry = Math.floor(carry / 58);
    }

    length = i;
  });

  const strResult: string[] = Array.from({
    length: b58Encoding.length + zeroes,
  });

  if (zeroes > 0) {
    strResult.fill("1", 0, zeroes);
  }

  b58Encoding.forEach((byteValue) =>
    strResult.push(base58alphabet[byteValue]!)
  );

  return strResult.join("");
}

/**
 * Decodes a base58-encoded string.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/draft-msporny-base58-03#section-4}
 *
 * @param b58 The base58-encoded string to decode.
 * @returns The decoded data.
 *
 * @example
 * ```ts
 * import { decodeBase58 } from "https://deno.land/std@$STD_VERSION/encoding/base58.ts";
 *
 * decodeBase58("2NEpo7TZRRrLZSi2U");
 * // Uint8Array(12) [ 72, 101, 108, 108, 111, 32,  87, 111, 114, 108, 100, 33 ]
 * ```
 */
export function decodeBase58(b58: string): Uint8Array {
  const splitInput = b58.trim().split("");

  let length = 0;
  let ones = 0;

  // Counting leading ones
  let index = 0;
  while (splitInput[index] === "1") {
    ones++;
    index++;
  }

  const notZeroData = splitInput.slice(index);

  const size = Math.round((b58.length * 733) / 1000 + 1);
  const output: number[] = [];

  notZeroData.forEach((char, idx) => {
    let carry = mapBase58[char];
    let i = 0;

    if (carry === undefined) {
      throw new Error(`Invalid base58 char at index ${idx} with value ${char}`);
    }

    for (
      let reverseIterator = size - 1;
      (carry > 0 || i < length) && reverseIterator !== -1;
      reverseIterator--, i++
    ) {
      carry += 58 * (output[reverseIterator] || 0);
      output[reverseIterator] = Math.round(carry % 256);
      carry = Math.floor(carry / 256);
    }

    length = i;
  });

  const validOutput = output.filter((item) => item !== undefined);

  if (ones > 0) {
    const onesResult = Array.from({ length: ones }).fill(0, 0, ones);

    return new Uint8Array([...onesResult, ...validOutput] as number[]);
  }

  return new Uint8Array(validOutput);
}

//-----------------------------------


/**
 * Main action class 
 */

class Wechatmpc{
    private uuid: any;
    private config: any;
    private baseurl: any;
    private actionUrl: any;
    private loopInterval: any;
    private loopTimeout: any;

    constructor(uuid?:any,config?:any)
    {
        if(uuid)
        {
            this.uuid = uuid
        }else{
            this.uuid = crypto.randomUUID();
        }

        if(config?.baseurl)
        {
            this.baseurl = config.baseurl
        }else{
            this.baseurl = "https://mpcapi.sidcloud.cn"
        }

        if(config?.actionUrl)
        {
            this.actionUrl = config.actionUrl
        }else{
            this.actionUrl = 'https://mpc.sidcloud.cn/qr.html?token='
        }

        if(config?.loopInterval)
        {
            this.loopInterval = config.loopInterval
        }else{
            this.loopInterval = 500 //0.5
        }

        if(config?.loopTimeout)
        {
            this.loopTimeout = config.loopTimeout
        }else{
            this.loopTimeout = 120 //1min
        }
    }

    async loopCheck(pin : Window|null) {
        let flag = navigator.userAgent.match(
            /(iPhone|WebOS|Symbian|Windows Phone|Safari)/i
        );
        for(var i = 0 ; i < this.loopTimeout ; i++)
        {
            if(pin == null && !flag)
            {
                //Disable type check during using iPhone and Symbian ( bad browser core support )
                return false;
            }
            const ret = await this.check_request_action()
            if(ret.data)
            {
                return ret.data
            }
            await this.sleep(this.loopInterval)
        }
        return false;
    }

    async sleep (ms:number) {
        return new Promise((resolve) => {
        setTimeout(resolve, ms);
        });
    }
    async check_request_action(){
        try{
            return (await fetch(this.baseurl+'/result/'+this.uuid,{
                method: "GET",
                headers: {},
                redirect: 'follow'
            })).json()
        }catch(e)
        {
            console.error(e)
            return false;
        }
    }

    async connect(chian:any,redirect:string) {
        const site = window.location.origin
        
        const d =  {
                        t:0,
                        i:this.uuid, 
                        d:site, 
                        c:chian, 
                        r:redirect || null
                    }

        const pin = window.open(this.actionUrl+encodeBase58(Buffer.from(JSON.stringify(d)))+"&uuid="+this.uuid,"newwindow","height=800, width=400, toolbar=no, menubar=no, scrollbars=no, resizable=no, location=no, status=no");
        return await this.loopCheck(pin)
    }

    async sign(chian:any,sign:any,redirect:string,preconnect:any) {
        let d;
        d =  {
                        t:1,
                        i:this.uuid, 
                        d:sign, 
                        c:chian, 
                        r:redirect || null
                    }
        if(preconnect)
        {
            var hd = new Headers();
            hd.append("Content-Type", "application/json");
            var op = {
              method: 'POST',
              headers:hd,
              body: JSON.stringify({"data":encodeBase58(Buffer.from(JSON.stringify(d)))}),
              redirect: 'follow' as RequestRedirect
            };
            d = {
                i:await fetch(`${this.baseurl}/preconnect/${d.i}`, op),
                p:1
            }
        }
        const pin = window.open(this.actionUrl+encodeBase58(Buffer.from(JSON.stringify(d)))+"&uuid="+this.uuid,"newwindow","height=800, width=400, toolbar=no, menubar=no, scrollbars=no, resizable=no, location=no, status=no");
        return await this.loopCheck(pin)
    }

    async send(chian:any,txs:any,redirect:string,preconnect:any) {
        let d;
        d =  {
                        t:2,
                        i:this.uuid, 
                        d:txs, 
                        c:chian, 
                        r:redirect || null
                    }

        if(preconnect)
        {
            var hd = new Headers();
            hd.append("Content-Type", "application/json");
            var op = {
              method: 'POST',
              headers:hd,
              body: JSON.stringify({"data":encodeBase58(Buffer.from(JSON.stringify(d)))}),
              redirect: 'follow' as RequestRedirect
            };
            let i = await fetch(`${this.baseurl}/preconnect/${d.i}`, op);
            console.log("## Preupdate test :: ",i),
            d = {
                i:this.uuid,
                p:1
            }
        }
        const pin = window.open(this.actionUrl+encodeBase58(Buffer.from(JSON.stringify(d)))+"&uuid="+this.uuid,"newwindow","height=800, width=400, toolbar=no, menubar=no, scrollbars=no, resizable=no, location=no, status=no");
        return await this.loopCheck(pin)
    }
}

//----------------------------------

interface WechatmpcWalletEvents {
    connect(...args: unknown[]): unknown;
    disconnect(...args: unknown[]): unknown;
}

interface WechatmpcWallet extends EventEmitter<WechatmpcWalletEvents> {
    publicKey?: { toBytes(): Uint8Array };
    isConnected: boolean;
    signTransaction(transaction: Transaction): Promise<Transaction>;
    signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>;
    signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
}


// declare const window: WechatmpcWindow;

export interface WechatmpcWalletAdapterConfig {}

export const WechatmpcWalletName = 'Wechatmpc' as WalletName<'Wechatmpc'>;

export class WechatmpcWalletAdapter extends BaseMessageSignerWalletAdapter {
    name = WechatmpcWalletName;
    url = 'https://mpc.sidcloud.cn/';
    icon ='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAIABJREFUeJzsnXd4HNXVxt87u6vei2VbLnLBvVdsS0ZywZgOwWBIIAkhtCQkgRBCEogJkAApkITwhQRCC4TY4AqmYwMGgxu2wQaMe5Vc1dvuzv3+kGyvtDu7U+7Mzsye3/OESLv3nHO1np33znmnMBAEYWvGrhvryzuQUuj3+rpIstyFc+RAknM4kAuOHIDlMIZscKQDSONAOgOSAGSDwQuObLAOKTMA+Dq+BD+A+tAXOFDNgCCAGgCtHLyBgTUCvAFANWOsGjKqZcarGXCCMV4ty+ywV+ZH/Fm+wysrVgbM+1QIgjAKiz2EIAizKFteVsj8rIfHg56c817grAcYegC8mDPWReIoBFB4OoJrL6LwLdf25VdZl53Oy4EjjOMwJBwB5/sZYwdk8P0A2+Ph8j6/nLR/5QUrj2qaBkEQwqAFAEGYyJz5czxVKVW9GGf9mST3A1h/cNYPjPcH0A9AqlJs+JfT/uKvPTeaAGwHsIMxtp1zeTvjbEfA491e/snKvfPmQdaWjiAItdACgCAEMXPJlO5+7hsCJg/lDEMYMBTAKADpHQaq+NbZR/xV1tYn/rHqtgLYzhi2gLOtjGNLwMu3FtR2/3LB5QuCQksRRAJCCwCC0MjYx8f6srqlDADzjJU5xjJgLAdGMyAtZrDKb1zHYTrEX6GWg8Q/UomTP/gBfA3G1zNZWs8lrE8NNG1YdsH6RqFTIAiXQwsAgojCnPlzPFVJVUMkD58Izs7kDBPAMZgBXs3JdIk/4ITWv4Xir0QAwFbOsAbAx54g/2Tyuo+2koVAEMrQAoAgQpi4fGJWcjC5lHE2BQyTwDEO4JmhY3R/aRzV+jfV99dUm+kvUAvwtYD0sQz+YYsfqz686MM64/MjCHdACwAioZmyZEqmj/smQsIMGXIpY2wCOHwdR50WJBL/8KQ2OPpXSxDAVwBfxZj0tj/gXUFXIRCJDC0AiIRi0vxJqUnJSaUAZgKYCYaRiPo9UBAkLZDvr6uuYPGPlFsGsAlgb3Ep8FYgOWXVyoqVzeKrEYQ9oQUA4XoqllWMlGV5FtpEvxRAirotP17iH17bSC3hR//uEP/w2gxNAD7gnL8FjjfePm/1Z+KrE4R9oAUA4TrKV5SnoAalXOIXgONiAL06DCDxV8Aerf84iX8k9nDgDYlLr7Smet+i7gDhNmgBQLiC6Qun5/s9/osAXMjAZqDztfcnUb3Fk+8fLak7jv6jin8neAMgvQnwpRLjS984Z/Vx4ZMjCIuhBQDhWMqXlRfIQflcxtgcALOAzifvdUKH+GsK0xgkRPwVapHvH07Ez1tfnSDAPgaTF0jwzn/jnA8OGZ0bQcQDWgAQjmL6kulFARa4XOa4nAGTAUiqN2Jq/SuQoOIvplaQMXzIwed7Ze/818794IjhjARhEbQAIGxP+5n75wO4hnc60ifx1z0FbXUTx/c3krutMwD+bEor++9SuucAYXNoAUDYkvIV5d5AHc6ROL8awAVQeGiOqg2YfH8F7CH+HXLbyvfXkjeMRjAsY8BzWbXFr9OzCwg7QgsAwlZMWVIx0AN+JcC/i85n73fCLPHXFKYxiHz/8LoO8f1V5FYcdAhMXiDJ/MnXZ3+yWUx1gjAOLQCIuDNlyZRML7xzOcd3wTBJTYw7Wv/ixF/DFNTXdqP4C6qlbfHZ4W/+iIM/5U9OeXFlxcp64zMhCP3QAoCIG+XLygfJQXwHDNcDPFdtnDvEP7y2kVpObP27WvxPDVT8rOvA8V/GPI+9cc6qTcZnRRDaoQUAYSlD589JKkg+fJEMdj0DZrS9qk0IyffXXF57XQcf/dtH/ENqRx+8Hgz/zK7hzy24fHWTrokRhA5oAUBYwpQlM7t7mP9mcFwPoPD0O/YQf01hGoPI9w+vmwC+P7T8O7eHHOGMP8647zG6twBhBbQAIEylbNm0MUwO3gCwawCkhI/QvJMUNND5vj+JfzhxP/rXIf4RcreCYQmT2cOvz/5otaZEBKEBWgAQ4pk3TyobtfJSBv5TgE1W3soSTfzDaxup5cTWv6vF/9RAcV0txvEhZ+zhSR9/tGjePMiaEhNEDGgBQAhj6Pw5SflJR+cC/E4AgwBE2cLs0fon3z88qROP/u0j/iG1BeZmHDs5w1+zavFPOk+AEAUtAAjDTFkyJdMD37XguB1AcYc3I25h9hB/TWEag8j3D69r3dG/OPFXncZE8e9EFWPsH81JSY+srFhZrS8FQbRBCwBCN5Pmz8rz+Fp+KjH8CEB22ACrWv82E//wYST+rm79i/H9tQZVg+Gv3lbPI6+ev+qEnlQEQQsAQjPTF07P97PgjzjDjxmQE3EQ+f6KtY3UcmLr39Xif2qgpeIfSj0Y/ztk9hA9opjQCi0ACNWULysvkAP4IWf4CdqP+CNuQG4Uf5WBJP7htcn315lbVdCpuvUc+HfQw3/3zoxPqvSUIBIPWgAQMSmfX54RSMIPGHAnQlr9ihsP+f4R6xqpQ63/cMzy/W0n/oqBET/res7w9yDz//7tmetr9JYjEgNaABCKDJ0/JynXd/Q7YPy3DCgKfU+b+APk++uvReIfTtyP/uPj+3ci6tUsxxjHHzKy2F8XTKarBojI0AKACKN8Rbk3WMu/C87uBtCj8/txF3/VA8n3j1WLfP9YuaMNsof4x8i9D2D3ZNb0eJoeSUx0hhYARAdKF5fPYMCfAQxXGkO+f6whiS3+p3K7Ufw7DIy7768l95cMuPW1WR+/pmcqhDuhBQABAChbPH0IEPgDwM6NNo58/1hDyPcn319nblWBhrfrtz0Sbnl15sdf6JoT4SpoAZDgTFo2rdgblO8D+DUAk6KNjXvr32biHz6MfH9q/evMrTpIwF0sgRbG8RfI/P7Xzv2kVn8awunQAiBBGfv4WF9618ybOce9ADJjjY+7+KseSL5/tFriv/Dk+xvOrTpIkK11mmOc8Xuzqns9SucHJCa0AEhAyhZVTAeT/wqwIWpjyPePNcT+4q89t7ba5PvrzK0qSLj4hyb5VOLST5bP+uh9EWkJ50ALgARi8qJp/byM/56Dz9ES50TfPzHEX2VtV7X+XSz+ioGmiv/plxheCcryLW/OWrNLRAnC/tACIAEY+/hYX1pR1u0AvwtAipZYJ4q/pjAdQeT7k+8vJLfqICG+f8w67S83AZjX5Ev588qKlQER5Qj7QgsAlzN5UfkoD8MTAMZqjSXfX80w+7f+SfzV5I42yB7irzu3ilphL3G+mXvk616fsXatiJKEPaEFgEuZNH9Sqi8p+Tcc+BkAj54c5PvHGmJ/8deeW1tt8v115lYVZI34h798qm6AAY81+lJ/tbJiZb2I8oS9oAWAC5m6ZNpUzoP/AtgAvTmc2PpPDPFXWdtVrX8Xi79iYLzEP7w2gJ2M48blsz55S8Q0CPtACwAXUb6oPEeW+IOcs+/DDD20sfhrCtMRRL4/tf4N59UUaKnvH7Fu+Fi2wOPz37ysYv1REVMi4g8tAFxC6eKzLpDA/o8DxUbykO+vZpj9W/8k/mpyRxuUgL6/ur+5Coz//LWZa541PCci7tACwOFMWjat2CvL/wDH+SLyke8fa4j9xV97bm21yffXmVtVUNx9f7UsDcB701tnf3hQ15wIW0ALAAdTunjaJQzyvwDki8hnlvhHTaN5UMfaJP7hSd1x9O9i8VcMtJXvr4ZqznHT67M+eVFPMBF/aAHgQNrO8E95gIPfIion+f6xhpDvT61/HXlVBzpO/EOjn2v2pd5MVwo4D1oAOIwpS8rHSZw9D3DdZ/h3hnx/NcNsfPRP4q8hd7RB5PvrrcOAXUySvvXq9NUfGU9IWAUtAJwCB5u6uPwWzthDAE8SmTphfH83in9IUrMWAK4W/w4DyffXW6s9bwBg96ef6HkvPVzIGdACwAGULpvRiwWCz4LhrLZXBH1xQb5/7CGJLf4dcpPvry23qkDntv5Dk4bm5sBqicnfenXG2p3GCxBmEvX570T8KVtcfhkLBD+1TPwVsYf468ZK319fed1J3SH+5tWJPQESfyO1OudmwCTOpQ2z3z7zm8aLEGZCHQCbMnH57KykluZHAVyt16OMBvn+aobZ+OjfdeJPvr/TfH+Fcp3HPe1N8d6ytPTDOuNFCdHQAsCGTFlSMZDJWMiAIQDa/5VI/En8w5OS7x8rd6yB5PvrraNhztuCHvnSN6at3WK8OCESsgBsxpQlFRcyGZ90FH8LEOT7G6slNMRA7sQWf2sh8be29R8XBniCbPXstydeFu+JEB2xyfZBzJk/x3PIe+x+MP7zUyfVxr31bx/f36yjf2HtUVWt11gkaOtfUB2zWv/k+4cn1bmw5eDsb42+1NtWVqwMGJ8MYRRaANiA8mXlBYEAXgDYzPCdL7X+rWv9ixN/DVNQX9uN4i+olhN9f2Efsd18/9i13/MydsXSGZ9UGZ4TYQhaAMSZspenjZEl/jIDSoDOO2ASf/L9w5OS7x8rd7SB9hB/3blV1rKB7x+9Nsd+cOmy5bM+/sTArAiD0DkAcaR0ccU1XOKrIou/BZDvH0Jii7+Z2Ef8TcqtKijhfH9E3b4YekCS35v91vjvWzcfojP22VYSiNnLZyfXtTb/DRynNn77tP7J9zdSi3z/cMj3T2jfXw3Ppad7blgweXWTphKEYWgBYDFTlszsLsn+xRxs/MnX7CP+2mq7o/VP4u/q1j/5/kLqmLJth5bgbE1ADlz8xjnrD2kuReiGFgAWMnlh+TCJsVcB9Ap9nXx/8v1j1SLfP1buaAPtIf66c6usZXvfX7nEyR8OcJmfv/zstRs1lyR0QecAWETp4vIZEmOrEFX8LcB24m84xEDuxBZ/M7GP+JuUW1UQ+f7RiLDvK2YSe3/2O+Nmi50ToQQtACygdPG074Kz5QCyQ1+PS+s/IvE86Y/u8x8tqVNb/xHrWqlSVvr+ESHfXyeZEpeWnvv2hBtEJCOi44n3BFwNBysdNW0ewB9Gp8/aXr6/gNy66pDvH62OU8XfPttfPFv/BvOqTORU8Y+x/UkMOH/gNT3yrup74M2VK+N2m0rXY5/OkcuYvXx2cn1r85OcI+ITsdip/wDk+5PvHykp+f6xckcb6H7f3z7ir622xu1vQYMn7ZqVFSubNU+JiAktAExg0vxZeR5f60Lg5CN8O2L50b8bxV9lIIl/eG2zFgD2Ef+Q2iJzqwqi1r+K9FoLfCR5ghctq1h/VFMUERNaAAim9OUZfeEJvgqOQZHet0/rn673N1KHWv/hRLRZ3Cj+ioEk/ipLaP9wOLYzzs595exPvtYYSUSBTgIUSNmiaRMgBT+2v/gLyq2rjnWt/2h1jUDiH07cjyRM+E7FrmVoiMDyLhf/tpj+kPiqc9+cME5HNKEALQAEUbqovJyDvwWgMOpAW4i/g8+M1u37m1crOvY4f8nVvr/O75SZrX8h2N7311zCUBEOdGESVsx+Z8I0EXMiaAEghNLF0y4AY68ByFIaY/kRklt9fxXYp/VvH9/fhAIKKePQ+rcqtw18f/tguu+vVDdD4nzZBe9MPFtEtkSHFgAGKVtU/i1wvhAcKUpj4tL6j4g9HvJjZi37iL+2WrbrtBip61bfPyLk+8eBNJnLy857a/yl8Z6I06EFgAHKFlf8lIM9C8CrNIZ8f4B8/+hJyfc3OgEX+f4uE3/BR/+hvyRJDC+e9/a4uSIyJyq0ANBJ2cKK2znHn6Fm07aF+Dv4CMnFvr/dfdeYuU9Bvr9Z2Ef8dZUw5TvF2l7xMbD/XPD2hO+JqJCI0AJAB6WLy+/gDA/FGke+P/n+WmsZg3x/4blt5/vHs/0eN98/cu42PBz8X+e9M+4nIiolGrQA0EjpomnzwNkDscaR7284RHWgfcRfWy3bdVqM1CXf3xi23/7EfaeMoPQxMbCHz39n3G/EV3Q3cbfxnETpovJ7AfbrWOPs4/u7/2Y/4cPoPv/U+teZW3VQhNsqG4F8f9W1I6ZkHX58cNn0tb8QUTkRoA6ASqYsrLjfWeIvKLcuyPc3vZxCXRJ/nblVB5Hvr6KEdeIfHnHH+e+Mv1dE9USAFgAqKF1Ufi9j+GW85xER8v0Va+tMEu1lBeLp+1tTJ+7ib2VuF/v+pnS1Oue2Uvwjv/Hr898df6eIWbgdWgDEoGxhxd1qjvwB8v0FhKgOtI/4a6tlu06Lkbrk+xsjDtufNmzt+0evxfG7894ef5v42bgLOgcgCqWLym8D2B/VjLVP6598fyO1yPcPJ+5H/1aKP/n+uurG0/ePlogz3PjqtLX/ND4nd0ILAAWmLJr2Ewb+sJqx9hF/bbVt1/rX7fvbv/VP4q8md7RB9vH9zVoA2Ef8tdW2Ues/EkHO+bdenbHuRf1zci+0AIhA6aJpVwP8GWjdR1m1AHCj+KsMdKL4a8+tvrarxb/DQJOP/m3g+wvpakVImsDif3K4X2b8slenrVuqa1ouhhYAnShbWHERZ3gJUW7vG4oTxT9qGs2DOtYm8Q9P6o6jfxeLv2Ig3edfVQlh256K/Yj+Wq0M/OJl09e9pjuDC6EFQAhTF06bJkv8VUR5sE8o9mn920P8NYVpDBK2gyTfXxVxP/on8RdSKwF9/2g0SsDspdPXvm84k0ugBUA7ZYumTeDg7wDIUDPePuKvrbbtWv9u9P1J/DXkjjaIfH8jdRK99a+QooZJbMbSijXrjGdzPrQAADB16dQ+ctDzMYAuamM6fgHEXnaXML6/G8U/JCn5/rFyxxpIvr/eWiT+UVMcZVJw0tKKDduNZ3U2CX8fgEnzZ+XJQc9r0C3+YjHT99c/AeEhBnIntvhbi4vFXxG63l9Veqv2fYJqdUpRwGVp2XkfDM81ntnZJPQCYOj8OUmSr3UBgIFqY+LS+o+IfXx/XVjp++srrzupe1r/5tSJPQHy/Y3UMnM/Ihb1dpoRFD7rQVJr8uLZy/snG6/gXBJ3AcDBcn1Hn2DANLUh9vL9BeTWhXWtfyGY0KaMVsc94m/xYsuE71TsWvHBPuKvq4S1rX/hdKg71ZOc8zR4vLeI+OGJ9wTixZSRFfczhh9qiTHL99cu/uT7G6nlnNZ/WPoE8P1NyK0qyMG+v+5tL6F8f6X3hw3c3Y1te+bQSuPVnEdCrnxKF1ZcC4YntcRYfvQvyPc3q/UvtvUaa0giij9d7y8kt6ogav2rSO8C8Vf4mxkAxr67rGLt08arOouEWwCULiovB9gbAJLUxtin9W8P8dcUpjFI2A4yQi1TjpBcJf7ttQXVMav1T75/eFIzfX/LFwBWi38bfibjvKUz1r1lvLpzSKgFQNni6UM4lz8EkKM2xj7ir622O1r/4sRfwxTU13aj+AuqZabvb9bRv7CPWNXik1r/Zol/eJqY4n+SWibLZUtnbNgsZhb2J2FOAix7uawb5/Jr0CD+4ZD4Wyf+OrGy9W8yrhb/znVNyR0rKF6X0ZL4m3nkaaDzmcUltnz2iok9hE7IxiTEAqD8qfIUSJ4lAHppiTNzBxy9YGfoen+dSaK9rIB9fH+zsIX4W7X92dL3jxc2F38rW//KGYq9PPhSolwemBALgEAOe5SDjdcSE5fWf0Ts4/vrwkrfX1953Umd2vqPiJUqZaXvHxHy/eOFLcQ/dq2J3pScvxqdjxNw/QKgdFHF9QC+pyXGXr6/gNy6iNf1/nTSX1xa/6bkjjbIHtf7276rpZDUknmbcPQfvaBIdIv/Sa6/YMU4TbrhROzTnTKB9gf8vA9AUzun4xeAfH9rff/Ebv273vfX8Z1yR+uffP+4H/1rr9MMmU1dNmPtWj1zcgKu7QBMWDg9Xwb/HwyJvwXYTvwNhxjIndjibyb2EX+TcqsKIt8/Gq4Wf32kMIm/NPv90YWiEtoNVy4A5syf40lm8gsMKNES51TfX+wEHOT7W7nzdXjrP2Jd8v2NQb6/Kmwh/voXn72SAp7/zpk/x5V3zXXlAqDSe+QBDpytJcbVvr9O8be97y+kfCL6/hbnJt9fSFIzxZ98f+UQDkxvKdh5r64p2Rz7dKoEUbao/GIOthAa/zZ26j8A+f7k+0dKSr5/rNzRBrrf97eP+Gur7erWv846EcI4Y7h8ScW6l/RltCeuWgBMWVIxkMlYAyBLS5zlR/9uFH+VgST+4bXNWgDYR/xDaovMrSqIWv8q0rtT/HXWihJSz2TPxCUzPtmqPas9cY0FMHH57CwmYwnsLv6K2ONmP2bWso/4a6vlRPFXrOtG8VeExD9euFD8ASCDS4EFc1YMzdCe2Z64ZgHga2l+FMBALTHk+wPk+0dP6lTxj3trz42+v8vEn3x/PSFsSAtP/Yv27PbEFQuAssXllwG4WlewLcTfwUdIun1/82pFJ16ftUJuN/r+Or9TZrb+zcI+4q+rhLWtfwGIPfjRzbUXrRhzhelVLCDuBwpGKX+5vEdAYpsA5GmJI9+ffP9YtUxfbLlR/DsMJN/fSC3y/WOlsProv0Pdah7EyGUz1+/VXs0+OLsDMG+eFGB4FnYXf0Xs4fsnhvhrq2W7TouRum4Uf0VI/LXUEUkCiT/AkMN87Dmn3x/A0QuA0hEr7wRjFVpiyPcHrLrZjyl1dZcn3990yPcXUssS318I1vj+9hH/ztPgU5sLd/7MSIp4E/d9hl5KF1WMBfARgCQtcR1bry7z/a1q/ev2/e3f+hf/hUiQ6/1t6PubtQCwj/hrq+3q1r/OOjqP/kPxSzIrXTx93Rp9M4gvjuwAnP3G2ekAnoce8bcSN4q/Spwo/uIRt6OKRtzF38rcNvD9o9U1vZzO2iT+RsMUv1M+WeLPO/XSQEcuABob/X+BEy75iwj5/kbqkO+vsi75/saIw/anDfL9xeaORszvVP9mJP/RyHziheMsgNLF0y4B5wu1xNjH9zehParT97eu9a/zs1bVeo1FIvr+id36J99fsYR1R/+u8/1VfqcYLl9avn6B9hnFD0ctACYtm1bsDfBNHMhXG2Mf8ddW23at/wTy/X2SD9lJOfBJPniZF6neVABAiicVXsnblp3LaAg0AACCXEZjoAFBHkRdaw2agk3hcybx15ZbdRD5/ipKUOtfd5j67xQDjno8GLFw6vpDOqYVF7zxnoAWpAD/uxbxjwtuFH+V2F38vZIPRalF6JraDd3SuqEorSu6pBQhKykL2UnZyE7KRXZSNlI9qVpn3QG/7Eedvxa1rTVt/++vw+HmShxuqjr9v+ZKHG85rrtG3MXfytzk++uqTeJvNEzzd6ogGMS/AJyvqUwccUwHoGxh+VzO2H+1xFh+9C9A/KOm0TyoY+1E8f29khclGSXol9UffbP6o29mP/RM74mClAIwZp/TXlrlVhxo2Ic99buxs24H9tbvwq66nTjUdAicy1FjI9osbvX9Vdhp1PpXKCFsD69iP+Kq1r+271THYWyOU54a6IgFwKT5s/I8vtatAIrUxtin9W8P8dcUpiMoXr4/A0OvjN4YnjcCw/KGo3/WGeiZ0Qte5qjmVgdags3YVbcTX9RswRcntmBr9eeoaqo89X7cj/7jLv4da5P4K5Yg3193iKbWf2cqA97WIa+WfXZCc1mLccQCoGxRxdMc+Lba8fYRf221bdf6t6HvLzEJA7IHYnjeCAzPG4lhucORnZStvZ7DON5yDF9Ub8XWE5ux4dg67KzdDg4OJ4i/6tyqg8j3V1HC4a1/ceKvPcyQ+J/kiSUV67+vqWwcsP0CYMqS6RVMlt+BHn10UOufxF/55RRPCkYXjMWZXSZhUtEU5Cfb+zQQK6hprcam4xuw4eg6rD26GkeaDxvKZ7vWvw18fyFdrQhJSfzVpHCG7x9lGAeks5dUrH1bU3mLsfUCYOyyC9JSA/WbAfRTG+NE8Y+aRvOgjrWd6vt3Se2CqV3PwpldJmNE/khHt/TNhoNjV90OfFj1PlZVrcSuuh2a4m0n/oqB5PurKkG+v84QYeJ/8v2vfclJIxdMXt0UY2jcsPUCoHRRxZ8A3Kp2vH1a//YQf01hGoOE7SBDEqV70zGlaxnKu5VjQuGZkGx0wp6TqGw6hI8Pr8L7le9iy4nP2q0CZZzh+5P4qyxBvr/uECGt/848sKRi/Z2ap2IRtl0ATH55+nhJklcDUPW0JfuIv7baid7690o+TCicgJnFZ2NS0RQkSZru7kzEoLLpEN468BrePLAcVU3hlyeT7x/rJfL9nej720T8ASAgy5i4bPr6DZqnZAG2XACUryj3+qulNQx8tNqYjl8AceLfIXfMF7XVTmTx751ZgotKLsG0btORlZSlOZ7QBucyNh3/FG8ceBWrqlaiJdhiv9Y/+f66artD/MNrG6kTz9Z/hOybumZi/D/HrfdrDDUdWy4AyhZX/JJz3K92PPn+HWvb1fdnTMKZXc7EpX0uw5iCsWD23PxcT0OgHisPvY3FexZgb/3u6IMTVvzDaxupZVbrX6z4d6wdd/HXWctO4h/C7Usq1tvueQG22wNPXjStn8T45+BIUTPePq1/e4i/pjCNQXp3kGneNEzrPgPf6DsHvTN6a50ZYSJbTmzG/F3/wSeHPwo/V4B8fyG1yPePlcKVrf/OwY2eoDxk4fRP9xhJIxrbnVotQX4YnDlM/AXl1oV1rX+tdEktwhX95mJWj9lI86aZU4QwxNDcEbgn9yHsrd+NxXsW4O2Dr6Ml2GzKd0oRs3e+mnPH0/fXXMLa1r9wEkD820qlBT3SHwHMMZpKJLbqAExeNO1sCfwNtePN8v21iz/5/qEUphTiin5X4vzeF9JJfQ6jprUGy/a+jJf3vIjGQL2mWHe0/umkv7i3/l3g+ysmkfk5S6ZtUK1xZmObBcDQ+XOScn1HNwMYqGY8+f4da9vB989JzsWcvpfj0pLLkOxJ1jsjwgbUtNbgpd3PY8nel9o6AjFwh/iH1zZSyxm+v83EX2ctR4h/W+0vijLYSLucEKjqEjsrGHBV0c8ZcIWasfZp/dtD/DWFaQxS86XNS87DtYO+j19pcumpAAAgAElEQVSNvguj8kefemQu4VxSPCkYkz8e5/S4ABwcO2q3IciDEceS7x+e1Dm+v0LumC8azRvP1r/6QMHiDwCF9a28+qunK1eLSG0UW3QAJi2bVuwJ8C8BZMQaax/x11bbHa3/jnWTpCTM7X8Vrux3FZI9qk7bIBzK4aZKPLHtMbxf+U7YyYJmHf0L2zlFSGQf8ddW24kn/YWnSRDfv0OSDn9zLQ/4Biyd8UmViBJGsEUHoM/lJX8DMEHNWPL94+n7n2ZS0RT8bsIDKOs6lY74E4B0XwbKulZgQuFk7K3fjSPNbfsud7T+Sfytbf2Lq2NW69/kxWcyk+SsL58+9IqoMnqJewegdGHFSDBsABDzvq/k+3esHQ/fv1dGL/xw6I8xrnC83uqEw+HgWHHoTfx72//hqNaHENlO/MNrG6lFvn+sFAnp+0d6OcgZG73krPWfiSill/jfbJ3hj2rmEZfWf0TsIf660Sn+KZ4UfHvAd/GvqU+R+Cc4DAzTus3Ck6Uv4vI+3xLwzAYSf9vhKvHXFmSB+AOAh3H+iIhSRohrB6B0Yfn5YGxZrHHk+4fXtdL3H1s4DreP+AW6pHbRU5VwOdtrv8IjWx7A9tqvog8k319XbfL9jYbYwvePmJvLiOtlgXFbAJSvKPcGqqXNAB8cayw79R+AxN868U/2pOCaAddgbt8rwejJfEQUAjyAhbtfxH+2P4FWuTV8gO1a/yT+cW/9u9r3V71df+473G/UgssXRL7ExmTitlcPVLNrVYu/ldhO/A2H6Mo9Mn8U/n3WU7iy3zdJ/ImYeJkXl/f5Fh6d9BT6ZZ7R8U3biX88IfEXmzsa2nx/IWivNcxfuONqE2aiirh8L8qfKk8J5LBtAHpGG2ef1r99fH+zjv5PDkn2JOOaAd/B3L5zSfgJXQR4AC/ufAbP73gKnMuqvlPk+yuWEL4AsIX4W9X6t5fvr8Selsbaga+du71FxDS0EJc9vD9X+iEcI/6CcuuqY+19/ntnluAfZf/Clf2uIvEndONlXnyr3/dw35g/ITclP+Z4q7pabSS2+McuKBIb+P6m5I6WRNc+u3dKWvYNIqahFcs7AFOWTMlkctJ2AFHPKCPf31rff1r36bhtxO1I9abqqUQQEalprcafttyHNUc+CnnVmqN/+4i/ttqubv2T76/EEdmb2m9p6Yd1oqakBstvBNT7in53AWx2tDFivwAKuWO+CDha/FUGepkH1w2+Hj8Y+kP4JJ/eSgQRkRRPCsq7zUSylIKNJ9YDkDu87zjf3+Sjf1eLv85aZvr+Ntr+0lnQ3/jlM5XvG5+QeiztAJQvKy8IBNhOAJlKY+zT+ne/71+YUoC7x8zDsLzheioQhCbWHv0ID27+DerbnzJIvr9iCfL9dYc4xvePRI3f4+/zatlnJwzNSQOWGr0Bv/QzOEL8BeXWVcca8R+ZPwr/LHuCxJ+wjPEFk/Hnif9CcVov8v2VS5DvrzvEUb5/JLK9Qe9P9Idrx7IOwISF0/OTmLwLsRYAthB/B7f+VQRNL56OO0beSS1/Ii40BOrxwOa7se6owQeike+vqm7cj/7J99dCrd/jL7GqC2BZByCZybdBzdG/VbhR/FXwjT6X4Vejfk3iT8SNdG8G7hn9R8zucbH+JJbvMLRC4i82dzTscb2/oPJZvoDvx2JSxcaSj2zS/Fl5Hl/rbigsAOzT+nev7y8xCT8c+iNcUnKpnswEIRwOjhd2/Bv/2fGEtkDy/VXVtoX4u/qkP9MO2iw7F8CSDoAnyX8rbC/+gnLrqmOu+PskH+4afTeJP2ErGBi+2e97uHnwbervO0Hib6y2q8Q/DrnNF38AyPbJvlvEpoyM6R2AictnZ/lamvcAyFGcgC3E38Gt/yhBad50PDjhQTrZj7A1q6rexUOfzYNf9kcfSL6/qrpxP/on399onRM+uaXXgoot9WakP4npHQBfc8vNiCb+VuJG8Y9CiicFv5/wexJ/wvaUFk3D3aMein5uio7vlBFI/NWksL/4C8M83z9S0twgS/quGenDS5nE7OWzk+tamncB6KZYOO5H//bw/XX/QygEpnhS8MCEBzEyf5TezARhOeuOrsZvN94R3glwY+tf2N6XfH9xuWMlseToHwAgge06LmcOWFmxMmBGmbYaJlLb2vQdkPgrIG5H1Zm2I38Sf8J5jCuYhDuG/xZe5j39ohvFXxjk+5ueOw7izwBw8D65rO4SM8qcxLQFwJz5czyMS7d1ft0+4i8oty7M8/2T28V/FIk/4VCmFJXjjhG/hYcp36ncPuKvq4S1rX+rsGQCFvv+cRL/06/x280odRLTFgCVSUcuAfgZsUeaTAL5/klSEh4g8SdcQGlRBX469FdgTM03hHz/uLf+3er7R8Ay8QcA8PGXrBhbakZJwEwLgOPWzi9ZfvQvQPyNTUB4iGIgA8PtI39O4k+4hundZ+Nb/a4Le93MHbA2dOxHTJh83MVfWO5o2Mf3Nwulz5oxHtZJF4UpC4DSRRVjOdik0Nfi0vqPiDt9/+sH34AZxTON5ycIG3FV32txXo/T96+wT+uffH8jtcj3V5+UM37RJe+NGWxGabM6AB2O/sn3B8z0/c/vdT7m9rtST0aCsD03D7oNEwtLbST+uko43Pe3wUN+EsX3D6/NAG7KjYGE/01TlszszuTALgBJYUUc1Pq3ne+vEDSpaDLuG3c/JLV3UiMIB9IUaMTt627Ezrqv218RtA9h5PurS+EM39+sBUAcxf8kzUG/v2TpjM+rRE5BvGoEAz+Aw8Xf2ASEhygyIHsg7h7zGxJ/wvWketNw18gHkenLEpeUfH+VKcj3NwsNn3WK5PPeKLq+UOWYvXx2MmP4/snfyffXXlttrUxfJuaNvQcpnhTj+QnCARSldsMvRtwHSdWVATEg319lCvL97XLSKQO7efby/skipyF0AVDf0jQHQCFAvn8b5rT+GRh+PvIOdEsLu8cSQbia0XnjMbfPd40lId9fV10jEyDfPzypjk5Ll+S0TKFPdBO6AOBgNym9Iwrt4u8+339uvytR2rVMT0aCcDzf7Ps9jM0/01AO8v11prBk9ZGQ1/urC2cQagMIWwCULZk+AsBkQPQXQAUJ5PuPyBuJ7w0KvzaaIBIFxiTcPnweClK66AjWUzFe4q+QW/UbRnKT728WBj/rqZesGDFM1FzEdQB48CaAfH89tdXWyknOxV1j7o56i1SCSASyfDm4dehdYFr2Chb4/mIh39/03HH3/XVsX5Ln+7EHqUwlIkn5/PIMztlV5PsDZrb+7xz1SxSkFOjJSBCuY1TeeMzuofJZKW70/U35Y8j3t7b1r4tvn/3GiHQRiYQsAIJe6UoAna7PId9fpPjP7nkuJhRO0JORIFzLdQN+hO5pPaIP0r3ztbnvLwDy/TtiR98/AtlpqdIc3fMJQcgCgEv8WvL9DYcokp9SgJuG3CwwI0G4gxRPKm4dercJ98KwufiT728MZ/n+4fk4M3gpTBuGvzVTllQMZBwTAZDvbxSFWrcOvw2Zvkzj+QnChQzJGYELe14e+U3H+f4qcKPvbwPxt7XvH07ZhSvG9DeaxPACQOL4HhB6Lg75/iK/AGf3OBuTiybryUgQCcPV/W9AfnKn82PI99dV10gtS2wWIzjX9w/L7pHk7xhNYmgBUL6i3AuOb51+hXx/keKfk5SDm4b8QE9GgkgoUj2p+O4ZId8V8v0VcaLvH/fPQ2dSc20W9p058+cYuiTM0AIgUCPNBtCNfH/dIVG5acjNyEnKEZyVINxJRbdzMCx3tIEMNhf/BPb9hWCV72+J+AMAiuWuO2YYyWNoASCBX02+v0EUap2RfQZmFM80np8gEgQGhhsG/hSSJLX/rgV7+P62EH/y/U3ABH1kAAeuNpJL9wJgypIpmRw4v+038v1FfwF+OPRH9JQ/gtBIv8wBmNX9Qsf6/tELioR8fwf6/hHgF89ZMTRDb7RuhfHAdymAVPL9xYv/1G5nYUTeSD1ZCSLhubrfDUjxpGqIsHnrXwDk+9v6IT9aS4QWSZe9SRfozad7AcA5u0pvrCZsJ/6GQ6LilXy4ftANgrMSROKQk5SLc3uofWiazcWffH9jWHx+msXi31ZBxpV6c+paAExeeHYXANPiviGJxAa+PwB8o883UJxebLwGQSQw3+j9LRVdAPL9jdQi3z8W5ot/+2vnXPL2hHw9eXUtACTJPxfgXj2xkYi7769T/EV/AVI8KZjbT/dijiCIdnKScnFej29EGaHz5GHy/XWGkO9vIj4k+XXdGljXAoCBK9x2S08urW9YvCEp1DVj9Xth74vosj+CEMRlJd9CqifNcB7y/Y1Cvr+AElH/AAZYswAof7W8K8An6SmmGtv5/uZvSElSEi7vK2xdRRAJT5YvR6ELQL6/2NzRIN9fQAk1f9NZl3w4oovW/JoXAAE/uxQQc32ac3x/82vN7jkb+fSoX4IQykW9roCXhbqV5PsbqUW+fyziIv4A4GFB6UKtNTQLOeNyNGNNfR7NbwjIrauO+a1/L/PiCvL+CUI4eckFmFhY1v4b+f5GapHvH540jr5/JzgArlmbNS0Api+cng/Gpmot0hny/TsyrXg6uqV105OdIIgYnN/zMs0x5PsbhXx/ASU0WtRs+nkfDM/VUkfTAqBFClwIQNjZ/x1IQN//JN/oI6SpQhBEBEbkjkVJRl/V48n3V5M7Gvbw/RND/DvgS4b3fC0BmsScARdrm0/EHBqwh++ve0NSETggewAGZA/UW8HRNAebsenYp1h3dA2+rN6CmtYa1Pnr4GUedE3rhu7pxRiTPw5Tis5Chk/33S4TmhMtx7Dq8EpsPL4eR5oqcaS5CkEuIzspGzlJuRicMxzjCyZhSM4IeJihB4vZmnN7fAOPffmQ+gAT1MMW4m/6/k+b+JvZ+reOeIp/p9qcXwjgOc31YjF7+ezk+tamowB074nj3vq3ke9/kluH34oLel+kp4JjqfPXYdHuBVi4ewHq/XUd3ov0BfBJPpQWnYVrB96ArqlklahhR902/Hvb/2HD8bXgXA555/S2HbqJ5icX4PI+38a5PS6CV/JZNk+raAo24er3Z6Mp2BR1nOVH/64S/5DaVrX+beH7x7v134H6pvr6gtfO3d6iJoPqJX/3OT1nAfiu2vGdibv4qx5onfinelLwi1F3wicl6aniSFZVvofb1/wYa4+sQavccRtV2vhlLmN3/U68uncJWuVWDM8bSQ9KUqAx0IC/ffEHPPrFn3CwcT86bs/K23ZTsBHrjq7Gu4dex+CcYShI0XxFka3xST7sadiJ3fU7FMe4p/Uvro5ZR//CBJqF1BWdO0JSm4s/ACQlJSe/98VTlTvVZFG9F+UMmrwFVbhR/FXCAFR0n4Y0b7qJVewD5zIe/+LvuGfDXaj31ysPjPKht8qteGHHM/jV2p9Fz5GgVDYdxK1rbsCbB17tdNQPqN22q5oO4fa1N+H1/UtMmWM8mVqk/Hht94h/hH2nzcRfGOT7R4Rzfp7aseoPozg/V9dsQL6/0pDzeul+iJPj+McXf8eCXS+Cn/r31b/Y2nBsHX7y8Y2o89cKm5/TOdCwFz/5+PvYXR9p4a/ts/bLfvxl6wN488ArwuZnB8bmn4kMX6byALf6/kJyR4N8fyMY9v3DUX0/AFULgLIl00cA6K02aSjavgA6r9M1PEh7bWO1gOL0YgzJHWK8pgN4edd8vLx7fsgrCoKk4fPbU78b9316N4I8aHR6jqc+UI/ffPpzVPtPxByrZef7t60PYtPx9fonZjO8kg+TC8vDXher+9Zc728v39/i3Lbw/c2pExtVOtX3GyvGDlIzUF0HQJbPUTWuE3H3vVRjne9/clhpV8O3U3AEBxsP4MmvHg95xbj4n2TDsXV45usn9E7NNfz5s/uwv3Gvwrv6F7YBHsCfP7837FwNJzO169kdfo9L698qLJkAnfQnoIRK1NflnqAqzVa3AGBc2TzTSoL7/icp61qmOM5N/OOLR9Eqt0YfZOBDf2nXi6hqOqQ/gcPZfHwDPjryvsK7xrftw81VWLTnfzoi7cmI3LHI8rU9cIt8f6NhcfD9I+B48Td20p9SblWaHXMBUL6iPAXAFE3VofA3CRB/YxMQHqI6MHRIfkoBBucM1lvNMeyu34WPqlaFvCJ+seWX/Xjm6ycFZHImT2z7u8I74j7rBbueg1/2G8hgHzzMg1F540+/QL5/lNzRcL/vbx/x15X7rNnL+yfHGhtzASBXS1MBpOqYgEoSx/c/SVnXUrAEuIzt3QNvhfwmrvXfmRWH3kFjoNF4Ioexu34nttV+EeEdsQuthkA9Pj2+xmAW+zA6fwL5/sZDrM0dh9a/6ZigUyEp09MzM2I+tTemCnEma2r/k+8fe9iUBGn/f1D5XvtP5ok/AARkPz49tk5MMgex+rBS6188Hx5eaVktsxmdN6HtB0f7/nSzH8e3/lWhv67MY9sAsQ9DmTovIUYOBRzs++sU/zRvGkbmj9JT0VH4ZT/2N+4Pe92s1te6o+45QlXLhmOR/mYTdpIM2FW3XUQmW1CY0hU90nVd1NQJd9zsRxvk+wsoYZbv3/l3YwuASfNn5YHz4XonoPwi4HjfX1dujmG5wzo9n9ydHG6qar8ZjTV+3f6GfZbUsRP7Gzv/zeaIPwAcaa4Skc02dDgPQADk+xvNHSsJ+f6qcndk7MUrRuVEi4u6APD6WqYC6sxq8v1jDWmrOzx/hPH6DuB4yzGY3foPpaHTMwUSgYYOd0M0T/wBoKa12lX3XBiVN9FgBvL9Tc9Nvr+xlAyS5Il+An90cWdM1cXqcW99qca61r8SI/JGGkvgENK8aR1+N3v163PhA2xikeyJeZKvMHxSkqueFjgwe6iBaPL9xeaOloR8fyMFJYaoGh59AcDls1TW0fBG4vn+J2v7JB8G5qi6QZPjyfRlnfrZitZXt7Ri8cltTpeUovafzD36B4C85HwRWW1DblI+8pILdESS7x8vHC/+Fvj+EbJF1XDFBcDE5bOzwJi+w1Xy/UM4/TcPzhmCpAR58l9ucp6lR6jF6T0sq2UXuqR2hRXiD8B1TwcEgP6Zxu7FQb6/0dyxkpDvryp39DfGXrhqoOIDMBQXAMmtzaWI8bhg8v1jDelYd0R+YrT/gbZux/C8UZZ9AUbkjRZfwOaMzBvT4XezxB8ARgs+ac4O9M8cqDGCfH/Tc8fd94/nQaoQ378zXg9Sz1QarrgA4BylgiagGbf5/ifpn3WGmEQOYXyByOutOxKasjClC0bkJs7i6iSlXSrA2j8Js3fs4wti3lPEcfTP0mLHqdiPmPKPQL6/ta1/4SVUYt5BKpO54o1nlBcAjCuuGsj3VzMs/G/unVmiZwaOZWbxOUjzpcUeqJHOn/XZPc5NiDsrdqYgpQtG5Y8Tl1BhW++beYZGsXQG/TLV/k3xeV6IsUFGId9fQIm4+P7h45niJS+R95rz5kkMfKzGKgoktu9/Ep/kQ48E86mzkrJxUe/LhObs/FkXpBTg8j5XCa3hJK4b8ENIIhY/SkcPAK7ud/2pToObyE8uRIZX0R5tx2YP+RGWOxrk+wvJHT/fvyMSJs7jkbU+4otloz8YBrCsSO+R7x9rSOS6PdN7uuoyKrVc3ucqdE3tZlr+GwffglSv+C6DU+iXOQCzii8wliSK+I/MG4eJhVHdQEdTlNrdeBI3+v42EH8n+v7axd8U379ziewtH4yO2O5SOHQIRGwZkO+vrW4oJZl99CR0PBm+DNwz9vdI9qQYztX5n+SKvt/E1K7TDOd1OjcN+ikG5wwTmpMBKEwpwh3Dfys0r92IvgBIYN/flNzRkrjD99eGdQ+jk5kc0dKPuADgETwD8v11DwOQuAsAAOib2R+/GHmXoUsgO3/WM4vPwbUDbzQ2MZeQJCXj7lEPoTitp/ZghY0405eFu0Y+gJykXGOTszlFKUoLAPL9oxH3z0NnUvu0/gV0xzV9UJHPA4i4AGAcE9TlVHqDfP/OJOJ16qGUFp2Fhyb8BdlJ2ZpjQz9rL/Pi+4Nuxs9G/MqVvrRecpJy8cjEJzG+YLL6IIWPr1d6bzw84QlXnvjXmcgdAPL9LcEq39924q8ztzHULQDKV5SnAOhwhwzy/WMNiV03LzlPz2xcxdDc4fhn6bOY1eM8XWftD8kZhj+e+Sjm9LmKxD8CGb5M3DP6D/j+wFuQ5Yv6DJCI27lX8uHiXlfgzxOeQHc93QQH0jXGOQC2EH/y/U3A5b5/OEO+s6IkzIcNeyxdsFoaASafep18f211laAFQBt5yfn42fA7cUnvy/DqvqX4sOo9HG85rjg+1ZOCkfljcHHvyzC2QF1jKpFhTMKlva/E7OKLsGTfAqw49Ab21u+KGpOXXIBJhVNxWclV6JqaGLdU5uCo99dGfCcm5Psbg3x/Y+j7Y3y1nqwhADZETTV1cfkNHPhH1Drk+yvWVmLZOa8h3ZuuZUYJAecyttV+hQMN+1HVVImGQD3SvGnI8mWjV0YJhuQMhTcBH/QjksNNldh8YgOONFehprUaLXIz8pILUJBciL6ZZ2BA1mDX3EchwAM40lyJY82HcbilCkebq3Cs5QiONFfhROsx1PtrUeevQX0g0tMjbdb611nHrNa/MBFlIXVF546Q1D6tf6t9/461OePXLSzd/GToq2EdABkYHbWGG8VfJXo3pGRPMom/AoxJGJg9GAOzjd2XnVCmS2pXzEg9N97TEEpTsBG76r7GvobdONi0F/sb9uBA415UNh1AgAd0ZLSZ+AvLHY14+v7W1LGP+OvMLYS2v5lxFna/9LAFAOMYA2au768Km22URjYkav8ThH4aAw3YVrsVO+q+avtf7Vc40LQP4HLbAMH7CluIP/n+JpBwvn/nutEXAHPmz/FUsiPD4u776/xQ7eb7nySXFgAEoZrjLUexpXojtlRvwpbqjdhdvx3ySbFvR+zRF/n+YnNHS0K+fzRM1t4R8zikeQynvkwdFgCHvMf7SUCqtglYvCEp1LXz6jdFwE1wCMKtNAebsOn4Oqw/9jE+Pf4xDjbujzreTPG31kLUO8go8bren3x/YwW1ElY7Y8v7I3oDm0+dFdzRApACQyNWI99fsbYavFKY00IQCc3+xj1Yc2QV1h/7GFuqN8Ivt6qKi4v4k+9vDPL9teUWQuRtm0tsKIDICwAJbIjeAkKw2UYpZENigIcWAASByqYDWHP0Q6yqegdbqje1v2rNw19iYQvxJ9/fBBLe9++YgrMhAF45+WsnZeJDwiqS7x+xrha8CfgQIIIAgKqmQ3jn0Kt4v+pt7GvY3eldnZdFke+vM4R8f+uwofgDAOQOB/mdFgCdOgDk+xujPYmPrmMnEohWuRVrjnyA1w4sxqbj68AFHIWR728U8v0FlHCA7x8rLVNYAMybJwErB8aeAPn+WpMk4mOAicRjV93XeGX/S3iv8i00BRtjjNaxHyHfP0ruaNjD908M8deZWwixt23OMBgcDKxt8KkFwNQx7/aGLEW+AkChgBCs8r1UBooWf9WFCcKBBHkQHx1eiVf2v4TPT3yqMkrEd8o4thB/0/d/2sTfzNa/dZDvHyVFxqUrRxQvxOb9QMgCgHHW/1QKm/v+urDY9w8l9tEQQTiLxkADXtn/Ml7Z9xKOtRzWEGnCw8IikOnLRl5yAXJ8uchNzkeWLwfZSblI96bDx5KQ7stEkpSEJCk5YnyL3ITWYCsagvVoDbagMVCPGn81avwnUN16HDWtJ3Cs5TAaAvUq5hznk/6szE2+vyriJP4AAMkr9QfQcQEAGf3BokWT7683SWOAFgCEO6j112DZvgVYsu9/qPfXWSNICkXSvOnond4PJRn9UJzWG11Tu6MotTuKUrojzaJbb9cH6lDVdABVzQdR1XQQ+xp3Y2/9Tuxr2Bl94e9G398W4k++f0y43B/ASiBkAcAl1i9KhOrc5PuH0+hv0J6LIGxEdetxvLz7eSzfvxBNwSaAWXQWevsPqZ40DMgeisHZw3FG1hCUpPdDl9RuiPdjoTO8mcjIHIR+mYPC3jvcfAh76rdjW+1WfF27BV/Vfo6GQJ3uHZntff8IJIb468wtBO0aGar1HTsAER8IRr6/kToM1AEgnEtTsAmv7HsJ/9v1NBoD7QtZC+y0DF8mRuaNx6i88RicPRK90vtActgTC7ukdEOXlG4YX1AGoO0RxAcb9+KLmk3YfGItNp1YixOtx1TlIt8/FuT7q03BOOt/8ufT5wBI6B/+Z5jg1yWI7x9a/tSOkyAcQoAH8NaBV/Dcjn+iuvX46Td0+a6xv1OMSRiUNQzjCiZhdN5EnJE12HGCHwsGhuK03ihO640Z3S4EAOxr2IVNJ9Zg3bEP8Vn1+oh3RCTfPzyp6Y0Nl4p/20DeaQHAwfhS3sfIxxrvtkYYcfb9Q2mgBQDhIFZVvYt/f/0oKpsOdnxD8M7XwzwYnjsWk7uUY1LhWchLLhCU2Tn0TO+Dnul9cH6PK9AUbMSGYx/hk6PvYd2xj1AfqNWRkXx/ASVUYg/fX4ft3q/DS2XLywqZ39PpVF6H+/42aP2HsnTWa0i36MQkgtDDwcb9+MdXf8K6o6sjDxDk+w/MHorp3c7D1KKZyPRlac6YCPjlVmw4vhrvVb2OtUffR6uqZyXYo/XvePE34aS/uB/9dxqUxOW8F8o+O9HWAQj6egKhj9sk399InUgvVzYeQr+s/hHeIYj40iq3YMHu5zB/1zPwy/7IgwzuqPKSCzCt27mY0e089Ewv0ZMsofBJSZhYcBYmFpyFxkA9Vh9ZgTcPLcaXNZsVIuwh/mZiH/HXmVv1G9EwLv4A0MJ5TwDtC4C2XyIW0JFb5yDttY3VElw3RnlaABB25NPja/HXrb9DVdMh5UEGfP/+WYNwUc+5mNp1JryMHoqlhzRvBqZ3uwDTu12A/Y278e6hV/DGoUWo9+uxCJzb+jcdt7Q4EgEAACAASURBVPr+EZA83p4ANkdYAKiHfH/1HIq2gyUIi2kJNuOFnU/ipT3Pg3NZeaAO8fcyL87qOhMX9rwC/bPCL48j9NMjrQTX9PshLi+5Fu9WLseSfc+jsmlf25vk+xspoRLH+v6dkHsBp64C4D3bRjrY99ct/ua2/k9S2UgLAMIefH5iIx7Zeh8ONu5XNV7t99Er+XBW0UzM7XMtuqf10D9BIiYpnjScW3wZZne/FOuOf4gFe/6Nr2o/i9t8HC/+Vvr+uhB7+2zOpZ5A+wKAMfQAd7jvryu3NeIPAIdoAUDEmYDsx1PbH8PiPS+qe0Kfyi9jkpSMc4ovwmUlVyM/udDYJAlNMCZhfH4ZxueXYdOJNXhh9z8UzxMg318hd4L4/p1ynl4AcKC7lnk50fePdwtJ7dEWQZhBZdNBPLD519hWu1VdgIrWPwPDlKJpuLb/D1CU2t3wHAljjMydgJG5E7DpxBo8u/NRbK87/W/t1Na/6SSQ798pUTfgZAcAKFIfJxLrWv9CMFBrX8N+NAYaLLtHOUGcZPXh9/Dw1vtQ769TF6BC/EfnTcC1Z/wQfTMHGJ4fIZaRuRPwx7HPYPWRd/HMzr+hqknAwQf5/lYWNJZCzQExb9P8k6flqloAkO+vewrgXMbXNV9jZP4o7bUJQgdBHsST2/6GxXtf1ByrtF0XpXbHTQNvw/iCKcYmR5gKA8PkwukYn1+GpftfwEt7/i38qaSOF/8E8/07Ze4CAGzs42N96V0zWtSEmtX6d9P1/spw3DD4Zlze90rt9QlCI42BBjz0+W+w5sgqbYEKO2Av8+KS3lfhyj7XItmTImSOhHWcaD2K53Y+ihWVr6o7/yMUi4/+7SP+2mrHvfWvrY581J+b7M3unt0lIAfjJv66cYDv35mvqr8UVp8glDjYuA/3bLwd+xp2awtUEP8hOSPww0F3oHdGlAeGErYmN6kAtwyah4qu5+Oxr+7HoZOXDsYi7r5/PE9Od5D4a0fqlno0XwrIgS6xRpLvb5S2v/mrGloAEOay4dgn+PEn1woRfy/z4pt9r8ODY/9B4u8ShueMw1/Gv4i5JdfDE+vGTLbw/YWXUIn7fP/OtLaiSIKEqNftkO+vewphdSsbD6GmtUb7PAhCBSsr38S8jT9re+a8FiLsfPtmDsBfJz6Dq/pe57qn8iU6SVIy5pZcj4fGPIUeaSWaYsn3j5JbCOb5/p1DGKRCCUHkag8XMwGzsKP4t/3Gsfn4Ru1zIYgYvLLvJfzh83kIKN3LXyUSk3B5ybfx8Pgn6ajf5fTLHIw/jf0PZnW/NPxNq673t53468yt+o1omO77d0DyIEcCkGMoN/n+mlhz+GMBWQjiNAt2P4fHvvxj9Fv6KhGyA87y5eCeUQ/j2/1vglfyCZ0jYU+SPSm4acAvceewPyLL1y4FVrb+I0In/VlxgCxz5EqAFLED4A7fX+eGFKGW9vKRa6858on2s3AJQoHHv3oYT339d33BIeI/JGcEHj3zOYzJnyhsboRzmFhQjofHvYAzsoa2v+IO318b7vf9Q0MkIEeCJGebOwF3P+QnMsob0tHmI9hVu1NEESLBefrrx7Bk7//0BYfsfM8pvhi/H/N3uo1vgpOf3AW/G/UvzOx2cYfXyfePkjvmi+Jr660VFsJYtgSubAGYPgGB2NX3j8SaI2QDEMZ4evv/Yf7uZw3lSJKS8PNhv8WPBv+CWv4EAMAnJeEHA36NG8+4E15m0jZhO/HXmVsI1vr+oXVljlyJg3XoAJDvr7m8ZmgBQBjhqa//jvm7ntGfgAFZvmzcN/ovOKvr2eImRriGc7pfhvtGPY4sX1iD2CTI97f6EkgJyJEYQ4Y5EyDfX6nOlhOfo85fqzk7Qby853ks2P2c/gQM6J7WA38a/y8Myx0tbmKE6xiUNRL3j3oChcldxSUl399YCiGd97a/mTOkS5B5mvgJkO8fjQAPYMXBd0QUJRKI9yvfxr/1nvAHAAwYnjsaj4x/CsVpvcRNjHAtPdP64oExT6MkQ8BDn2zX+k9A3z+0LpfTJDCWajvxV4mTfP/QpAzAWwde11SBSGw+O/Ep/rTlHn2X+rUzLn8S7h39CDJ8mQJnRridvKRC3D/yXxiYNUJ/EtuJv87cQoif798paaoEIE1VrJU9G6t8fyHir63WydxfVG/Fvvo9ZlQiXMae+h347cbb4Tdwk58zu5ThrpEPIUlKFjgzIlFI82Zg3ojHMDxnnMCs5Ptb7ft3Ik1iahYAOj9U2/v+Qsqr8/0j5X7rwBuaqxGJRb2/Dr/d+HM0BOp15yjvNgu/GvEAfHSmP2GAFE8qfjX8LxiRO0FboIN9f7HirzOF6Nb/6ZfSJACp2tNHgnx/rbx54HXIBlq6hLvhXMYfPv8NDjUd0J1jevdzcfvQ38DDPAJnRiQqyVIKfjnsYQzNHqMuwHat/3ie9GcD37/jwFQJQPSHe5Pvr4B2378zR5uPYOOxDZqqEonDszv+ibVHP9IdP6nLWfjJkF+B0cN8CIEkSyn45fBH0DdjUPSBthN/nbmFYBffvwOpEgDlZ0KS728MFa2vxXteNqMy4XA+PLzS0LX+o/PG4xfD76Mjf8IU0jzp+M2IR1Gc1ltjJPn+cfb9Q/EqLwDI9zdWW6XvtbrqQ+yp3615BoR7Odp8GH/d+jvdz4wYljsKd4/6A3n+hKlk+XJx1/C/IScpP/xN8v0j1o27798RjwTAwCEC+f5Gy3FwvLxL5/3cCdfBuYw/bfmt7htFdU0txq9HPoBkT3RnjyBEUJRSjF8P+0vHq0ts1/q3x81+zKyl87P2Rl4AkO+vgDbfXy1vHXgDx1uOaQsiXMnLe57HpuPrdMVm+rJw75iHTz/WlSAsoF/mYNw04Fdtv9hO/HXmFoItff/QWhE6AEJWH+IC7SP+2mppye2X/Vi8m84FSHR21G3Dszv+qSvWy7z45Yjf0R3+iLhQXnQeLu55jcK75PvbyPcPDerUATDhQ40xAY24w/ePxLK9S9AUbNIRSbiBAA/gz5//FgGdN/v5weCfY2SeyJu0EIQ2ru7zI4zOnUS+v719/9Agj47rg8j3N6Ncnb8WS3Yv1BlNOJ1Fe/6LXfXbdcWeXXwBZhVfKHhGBKENiUn4yaB7kZfcJeRV8v3NqiWiOy4BCKqfAPn+Wmtp4YUdz6K69YTxRISjONxcif/u/Leu2N4Z/XDTwNsEz4gg9JHly8Wtg+6HxCSQ729L3z+UYNsCgHx/Ywi65KUx0Ijntz9reDqEs3jsiz+gWYf9k+pJxa9G/I7O+CdsxZDsMZjT6zph+cj3D0dQ5z0ggbV3AGJCvn+0pKL+sZftXYIDjfsFZSPszgdV72DN0Q91xf5g8B3oka71RiwEYT6X9boO/TOHikvoVvG33vcPJXjaAogK+f6ml2snILfiyS8fF5iRsCsB2Y+nv35MV+yZhVMxrds5gmdEEGLwMA9+PPBew0+fNMWuFVfQWIo4+f4hBCQAgehjyPfXWsso71euwOcnPjMnOWEblu5boOtBP1m+HNwy5BcmzIggxFGcVoK5JTfqjjfzpD8zfX/rJmBYp4IqFgBq8hgPdKr4m7UhPf7F38DpSYGupd5fh//telpX7A8G346cpDyxEyIIE7iw+Gr0yxyiOS4uJ/1Z1frX+TeZ0HkPSACald9PRN9ffVIzV5FfVm/Fot0vCa1A2IcXdz2l63a/U7pUoKxougkzIgjxSEzCDf3vBIOOK87d6vvrQKDvH0qTBA6F04/J949Wx4pLR576+p841HhQaCUi/hxvOYpX9mlf3CV7UvD9gT82YUYEYR79M4diVvfLVI8n3z9WiLAD5CYJQGP46/EUf5u3/k0mtPXVHGzGnz9/QPdT4Qh7snjvi2iVWzXHXdnnu+iS0tWEGRGEuXyz5AfI8uXGHEe+v6C6amx3hkYJUqQFgKY8unGc+Ftw9N+Zjcc24PV9rwitSMSPOn8tXt2v/Y6P3dN64JLeV5kwI4Iwn3RvJq7ofUPUMeT7CwpTGcQ5GiXOeScLwJqWioltDcf6/kpfgH98+SiONB8WWpmID0v3zUdTIOqaOyI3DroNPslnwowIwhrO7nYpilNLog8i3z9KbiG+f8gw3uRlYCF7I+ta/0Jwoe8fqUhjoAGPfP4H3DfuITBLP2BCJE3BJizbu0Bz3LC80RiXP8mEGYlnf+MeHGzci2MtRyBzGYUpReiW2hM900viPbW4I3MZO+q/xPGWw6hpPY40bwbyk4tQknEGUj1p8Z6e6XiYF1f3vQUPbLk17D3y/WOFiD9AZpAavQDqIxUg39861LS+1hxZjfk7X8AVfb9pxZQIE3j30Guo9ddoC2LANf2it07jTWOgAUv2vYj3q97EvoZdHd47uUl3S+2JsqIZuLjXN5Hpy7J+knGksukAXt77ND45uhI1/hNhX/MkKQmj8yZhVvdvYEze5LjM0Som5JfjjMxh+Lru81Ovke8fK0Sg79/x1wZPyVUl0wGM15hH1ARge/GP89F/KJuOf4qR+WNQlEongjmRv239PU60HtMUM7bgTMzt8x1zJiSAtw+9gns3/wxrj36IWn/HB1mFbs71gVpsqd6INw8uRqo3HWdkab823GkEeQDP7PwrHv7ibmyv24oWuTniVzzIgzjQuAfvVb2GbbWfY0j2KKR7My2fr1XkJRfgg8OvAyDfX1iYroNv/p4EoJp8/+hJ7SD+QNuO4r5P78LxFm0iQsSfL2o+w466bdqCbHz0L3MZ/9z2Zzyy9V5NT7CsC9Ti/756EH/78n4EuOp7kDmOGv8J/HrjTVi87z8Itv+davYjG45/hJ9v+A621201d4JxZGxeWcebA5HvHyW3aN+/Q+pqCTKqdeTSNYHO1XWRIL6/EsdbjuP3m+6BTHcJdBTL9y3SFsCA0XnjcUbWYHMmZJC/f/Uglu77X8grKnaSIS++eXAJ/vrFvWZMLe60yi2477OfYmvNp6de07IfOdF6DHdtvBH7G3fFHuxQ5vS6jnz/mCEmHyAzqUYCO70AsNb3F1fLrb6/EhuPbcBz258SOR3CROr8tfig6h31Ae3bhF0v+1u+/2W8cWBxyCv6jpBWVL6GZfv/F3ugw3hs2++wrfbz2AOj0BRsxINb7kBzUPsVI05gfP5UdE3tSb6/Yohpvn/oGyckDl6tMo9uyPfXUFslz+94Bh8f1vcYWcJaVlW9i1a5RVNM7/S+GJt/pkkz0k9N6wk8tf3RkFdUir/CG8/ueAzVrcdFTM0WfFmzGSsrl3d4Te9+ZF/DTizd/1/jk7IhDBLOK77ShLxa34iGdb6/LgzWYjKqJcaZegNPxwTI9wdEtP7DMnIZ9228G19Ub9GfhLCE9yrfVD/41NH/XFte8vm/3U+hSetRaZQ/oznYhJf2PGNsUjbiuV2Pdrhzp9F/waX7n0djsMFgFntSUXQB0rwZMUaR768ySPMwJvEaiXnZESf6/trLO9f3V6Il2IK71v8cBxr2G09GmMLxlqP4vHqjusHt20SGNxPlXWeZNymdBHkQ7x4KPbrV5vsr8W7lclec03KkuRJbqvX5/krUB2qx/tgqAZnsR6onHWd1OS/KCPL9jRBrOpyjSgo2B6uEZ9Y2zIIkzvf9lahprcEv192Gmtbq2IMJy3m/6m114hay+Dyr60wkScmmzksPX9Z8hvpAXftv4o6Q6vw12F73hYEM9mDtsQ9OHf2LPIjYeOITgdnsxfSiixTeEeD76/5HcLHvH0IrcFjy5HmOcED48pt8fw21DXKo8QDmbbhT1wNmCHN5v/JtzTEzukU7Koof2+u+bP/JmO8fObfzFwAHmvaITdj++e2od/5no0SfjEHomzHIUA5LOramT0Cc+Ksk6D0w8Ji0smJlgAHqz8Ih318l5rX+I7HlxGe4/9O7XdFKdQvVrcfxVY2KczRCtr9e6X0wMHuoqfPSS52/Nuw1Ub5rvb8u9iCbc6T5EADRnU+Ohgifu5uYFtYFSETfX1yQymFHF1y+ICgBAAfUPWmGfH9ddc0U/9CUqw+vwiOfPwhOiwBbsOHYJ7Ef5dxp+5ve7VxT52SE5mATRJ6gFJ7b2fikJOHiDwDNsvM/m2hMKpgBiUntv5Hvb6SO2ulwjioAkACAMcQ+D4B8f11YJf5tcLy+/xU8sPm31AmwAeuOfhx9QITF56QuZ5k2H6MUpnTp8LvITbqgU24nku6JdUa7Fk7vv/KSCgXmtR85SfkYkj0W5PsbQ8t0WPtBf1sHgOOQORMg398sFD9rBqw49BYe2HwPgjxoyVyIcDiXsfH4Gk0xvdP7ojitl0kzMk731NNzE9t6bXtYkNPpld7PeJIIn1/X1B7G89qcyQUzNY0n31/zkI7jWZvmS+3B+8RPIF7ir62WU1v/EeuG1Fl56G1aBMSRbbVfRr9HfoTt78wuU02dk1GG545BiidVuPinetIwJHuk3mnZhpG5E4wl6NT6P8moXPvdEEo0E/MroPa+F+T7G4UDkPcC7QsAsCgLACt9fyHlE8v3j8Z7h97BQ5vvJTsgDmw+sV75TYXtb1Khfdv/AJDiScXEgrLIbxrYzs8sLEeyJ0V/ApvQM70vSjIG6AtWEH8v82BSwXRD83ICOUn5KMkYGHOc6MWnrhQO9f071GVsH3CyAyArLADI99eF1b5/tForDr2F32/6DQKyX/xkCEW+rFG4F7yC+Gf6stA/M/YOMN58s+8N8Eo+Yfk8zINv9L5aWL54c0Xv6wxEhx9EzOh2CXKS8gzNySmMzp2sL5B8f83wds2XACAYywLQNAHy/U0ooJAyuvif5L3Kd/GzNT9CTWuN+EkREfmyWtvDYIbljAY7dSa0feme1hMX9Zzb8UUD2/pFPa9CbxHeuU04s7ACo3InagtSuOIpw5uFq0puFDIvJzA6d0rU98n31zxEsTZj7LQF4Av69oqZAPn+ptv9neuqLLi1+jP8+OPrsb9B91qPUEll00GcaD0W/kaU7W947hhT5ySSq/vdjLH5k9p+MbDBj86biKv73SRmUjaBgeHWIfejMKWr2oB2Orf+fbhj6B+R5csVOj87c0bmMPikpIjvke9vlI5/s5zsO90BeOfSd45x4PQTPsj311XXDr5/NA427sdPPr4Bn5/YJCAbocSXNZ+Fvxhj+xvhoAWAh3lwx/DfY2zBJN05RuVNwC+GPQAv8wqcmT3I8uXgvpGPozitd/SBCuKf6knFrYPvx7CcsabMz674pCT0zxwW9rotxN8Nvv9paheMW18DnDwJsC3hTvMmYGYSAXeNEoCdfP9o1PprcOe6n+KDyhUGZ0Uosa2m061bY4h/qicNJRnOaoOnetJw94iHMbfke5rOCfBKPlxRci3uGflXpHnTTZxhfClKLcaDo59CWZdZMc5u77j/6pMxAA+MfhqTCt1/4l8kBmeNUjfQulara3z/k3Bgx8mfPSd/KLmy5GwAg5zV+reP78/EFzidN1JdA7WCPIgPqlYixZOCobnD9SciIrJw7wuobDpw+oUY29/A7CE4u/hC0+clGsYYRuSOw7Su56I52ISqpoOKz6Noe8LhbPxi2O8xqbACjFm5B48PSZ5kTC6cjtF5Z6Ip0IAjLYcQ4IG2N0P+fIlJGJQ9Et/pewu+f8btyEnKj8+EbUCr3IJVR/6/vTMPrKI6+//3zM0ewiogVLGiFZS6lS0JaqUVQVC7vdi+tv5s39fWtq+1rbWr79uirW21tVq7aNVWW1QCqYoLsktkR0AgC/uSsIcACdlzc++c3x9J4N7c7czMmZkzc5/PP5CZc77Pyc2993nm+c6y6OzPrh/9m3ybRk9Tw/eP0Fhd9Y8TpQAQ0X/je72V/I3FSkffP7mUjhd2/QU7GirxwMd/hj6ZMu9ilt4cbD5w7geB99/IApOXjinCkJxh+M7oh/DtUT/B9oatONJ2EKc7ToIBGJB9Hi7I+ygu73cVAiyQUsuPjOp7FX445ioE9Q7sa9qBEx3H0BA8jYKMvuifNQiX9f04+mT0dXuZSnBx/rkrYVxP/iZR1fc/F4vt7fnvuQKA8X3GV0G+v+q+fyrW1L6Pmub9eOiaX2FkwaUORPQ3raEWnO442fWD4PvvEg9c/idCgAVw5YCxuHJAennXomRp2bi83zW4HIJt7jRkUPZQ9M3sj6bOBI83J99fkETJH+DQz1oAZ88B4Lq2L/4MswuwU8Qt39/N5C/v6L+3xOGWQ/juuq9jfk2pdfE051BLTdcDgAwUnyMLPmbrmgjCS1yUn6AjZsN3n/WByaao4/tHigQY4hQAjO+NnZFsAd7w/W3H48m/h6AexDM7nsLj5Y+gzQdPZnOLw63VZ/8v+uc6P/cjtqyFILzIiLyREtWcudmP6bgO+f6RBJl2NtefLQA+9eHKGgBxv/nVSf7GYpHvH42IxPKji3H/+ntwsLnaesA05FjrEUN/q4LMvsjPoPMvCKKHoTlxHgxFvr8giVv/3TS/PrH87BnKZwuAWbOgA9hpOoAJyPePxfVzoxlwsLka963/GpYcWeD2ajzHyY4TAMT/jkNyhtm3GILwIDFPPyTfX5CUyR8A3w52bmDve49ut7aABJDvL4Qbrf/4gzg6wh14ovJRPLfrT12eNiHEqY46Q3+uoblUABBEJFEdAPL9pYowzqJyfFQBwFj0TnVa/2r4/r5O/gl4rXoO/lj1GDg9UVCIUx11hsYPyh5s00oIwpsMyh5iUYF8/0QiOktSAHCun93p1eRv59G/c7iQ/COO/nuz8PBb+Hf1HOuLSQNOGyoAOPpm9rNtLQThRXID+cjSsp1r/Zv8nlXe949DICLHA70KgIDGYywAowFS4fmT/nzq+3eR+O/80t7nUN2835HleJWgHkRzZ5Pg6K7XuiCTbgBDEL3pZ+oRyG6e9Key73+OcIaWuAAY2DJsHwdaPeX7+y75u+f7JyOkd2LegZctrsjfNHc2Gj5fIj+jwKbVEIR3sfoURPL9425uHjOhvCZyW1QBUHpHaVgDej3KTPHWv834OvkbZHXtinP3MidiaBe+f8K593afTCoACKI3OYE8gzPI908mwgAwzrfOYog6mav3VQDgwJakAVJBvr+1uIr4/vHoCHegJvI+90QUYjdQin3uO0EQ0WRrOQZGk+8vEp6Dbem9L6YAYKxnkGJtjQSi/mn92xMn9QKMvZFahD3u9KMt1JJiROxrrbGYjyBBpD3ZgVzBkeT7i4pwxrf23hbbAWDsQ0NrMbAAMdLY97dFO9kgNWwWv9Cutxuek/xZ8QSRnmRpWYbnpIfvbyz5R27WEEjdAchluRUA7zS0JsEFpEaNhES+f2Ltwbnn2xjF2yQ/ByD+e5s6AAQRi85FcoEzvr/p5G+L7y8u0mtz8ExDS8xVfjHfPgunL+wAsMOGBaSAfH8r2OX7R07J0rIwNIcKgETwhF9aiV9rnW6wRBAxcKT6XDjn+5tCEd8/Ysv2hdP3dvTemujwY4NwJOEFSMB3rX974qRegLk30uX9P05HrIZJ/lqLXzlAEOlD4mIaIN/fVKz18bbH/TbnnIkXAOT7C+G6hyTB97964FjTc9MBM8VRazjViYMEkX4EBc+nId9fcDPjcXN6/G8sTRMrAMj3N6Z9Frd8f2OvdW/taweNNzSfSP16t4VaHVgHQXiLtnCizwX5/slEEmkzbqADcOOmsu0AzshcQHz87/srkfwlfADyMvLxsX6jjQulEVrUqyb2/qIOAEHE0hpujrOVfH+T4RtGFVXsjrcjbgEwaxZ0AJuEI6degHk83vqPi4d8/x6uGTgWGSxDxop8CztrAYi/1qc7TtqzGILwMG0xhTH5/iZFwIH1s1j8syoTmpaMsbgtg0QLMP4HId9frnayQdbjfuK8CZY1/E6O8M1LznGq/YQNKyEIb1MfTFwYk+9vTFtLck5f4kM6PbwG8U5qcuqkPwcg319c+xOD1CgAOvVOnAnWoyFYjzAPQ2MacgK5yM/Ix4CsgRFH4c6Tn9EHRjstJztqbVsPQXiR1lAz2qPOASDfP5lIKm1d46sT7UtYAHRwrM5iCEWNId9fCCWSv5QPQBfn5w7H8LwLjAtK4HjbEXxQtxY7Giqw/UwFTrQfjxnTs26NaRiQNRADsgdhYPZ5GJjV9e+A7EE4L3sIhuSejyE5Q217Al9XASBGz5rrqAAgiChOByO7Ym75/vKSv22xxcJ3ZuexdYl2JiwA1nxmTdPkt27YCsbHWVyAcTze+o8b14O+fw9XD3L+8r+K+i14Zd8/UH56c9cjdgWKT53rONVRh1MddUm18zLyMTjnfAzNHYYhOV1FwZCcYRiaOwxDc4ejf5a5R5HmGSgAeqgPnkZQ70CWlm0qJkH4jbqOniLfTd9f3iQ3fP+IaZtmX12e8Ezj5Gd1Mb4SwLhECyDfPxbX36QSff8eruh/pTStVNS11+Kfe/+G5UcXphxrtmXXGmpBTfM+1DTviyuaqWXivOwhOD93OM7P/QiG5X7k3P/zLkh4pN9HsACIfP9xruNQSzUuKRglNJcg/M7RtuqYbcr5/gokfxFtnWFlsv3JCwCOlWB4gHx/g9pn8bbv38Pl/T9uSM8M7eE2zDswG69Vv4KgHozeKVR8Snh/dYuG9E4cbzuC421HAGyMGVaQ2Q/n5w7H0NzhOD9nOIbmDjv7c5aWFbv+eOuO+AVqmvdRAUAQ3Rxtq4Hyvr8pbXkiwtphCwVAVlZoVTCUoSPeY4NFFwCAfH/Z2lYHik/pk1mAC/MvMi5sgA11a/DXnb/HibZYf99R60SQps4zaOo8gz2NO2DKZun1O9W0xOlEEESacqxXB8CLvr8t3XHj2uFgZ2BtsgFJC4DF09ad/tTb12/jDNeaXIA4Hm/9x43rSvKX+0a6ov+VsOuRtfub9uCZnX9AZX3MY6q7EK5+5R3929lpSURN834pOgThB6pbzt2zxnVLVcqkVMj1/c9N55vnT97aL1WjFAAAIABJREFUkGxMyju7cA1Lwc8VAOT7x+L6QaoNvn8Pl/eT3/5v7mzCS3ufxcLD8w0/Dc+ryT/Z+29XYyU41129hJEgVOBE+1E0dtYDIN/fqjbnWJpqTMpvHM55SpEks81PlYivfX+TyV90ebL9/xXHFuMba76EBYdeT578Hfb9HTnSSBCkqbMRh1prbFwBQXiDfc1VxiaQ758QnbGUuTv1vV3zM1ajJdwGINfTvr8fk7/N2oxpuKzf5VJiHms9gr/s+B02nxJ4zpTrLZVUWPf9e7O9YRtG5F9sekUE4Qf2NW8HQL6/dW20NDe0Jb6bbzcpOwBlk8vaOfhqz/v+tuMf37+HEfkXIS8j38CMWEI8hNIDs/HNtXdaSv7qHP3b09XafmabLboE4SWqzmxS4uDH+qRU2OP7RwitWDh9b0eqUUJPd2GMLQXHFPHg5Pvbjo2+fw+X9bvC0vyK+i340/bHcailWmyCz5K/kfdfef1mQ9oE4Tfawi040N0BSAn5/klhXBey7oUKAM4DCxnCj4uFtrWtYVzbj61/m33/Hi7ra+7xvw3Bejy3649YcWyxqfmRqJP8TYUQDnKyvRYHmvfg4j4fs2tJBKE0Oxu3IMzDqQeS75+SMNeEvnyFTjsuu7WskgMHUo9U7P7Jfkz+DmqP6j/G8JxVte/h3jV3Gk/+Qgt080Mr3/fvzQcnEz6zgyB8z9b6hLesPwf5/iLsK72ufJfIQOHrjhiwwPx6ooUi/pEE+f5StCPI0DJxcZ9LhMcfaz2Cn22+H7/e9hAaO5NeehqL5OrXTKzkOHNXso1UABBpzKbTZbboetH3txSe403RoeIFAOMpCgDy/W3HAd+/h0v6fgyZWmbKcSEewpsH5+Hb6+7CllOxt81NiV99fxPsatyOhuBpCwoE4U0Otu7FifYjyQelke9vBQ1M+GBduADIYgUrADTF3+uW7+9m8ven798z6bK+qS//295Qge+suxvP7nwS7eE2M5EShe+FP33/3nCuY1XtMlnLIQjPsOlUWfIB5PuL0hjqHxZuJQoXAAunL+wAWJxvJzd9f2fiuJ78ndTunpTs+v+WUDP+tvMp/HDjN1Ft5Ta25PvH8N7x1E9BJAi/saZuUeKd5Psbmb+odExV4qeR9cLYvUcZf8vwigDy/ROgmu8fyagElwBuqFuDb639CuYfnGv4Nr5RkO8flz2N23FY9LJJgvAB1S27cLB1b/ydJj9Taef7d6Nz/raR8YYKAD0YmA8gorog3992nEz+3RNzM/JwYd6IqF2nO07i0W0PYdaWB1HXXms2QlSc1Jv97/vHi72CugBEGrHqxLtS9dLR9+8mmKGL+/+AwQKg7HNlDQB/v+sn8v3laicb5MAzFSIWdFnf0WcfTMPB8e7h+bhnzZewqvY9J8J3kx6+fzRdv/PyYwsQ4iEZggShNCHeiZV1CXIW+f6G4MDSV6+vqDcyx/DjxxjTXlPF9/d18ndSu9eky/p2tf+rm/fh+xu+gae3P4bWUIutH4Bo0sv37x33ZMcJrDuxQoYoQSjNhpPL0RA8GbvDj76/zbYn43jN6Bzjzx8NdcwHkPp2TQ60/p0jPXz/Hi4uuAQv7/s77lv/New8UylPm3x/Ycm3D82TL0wQirHkeGnsRr/6/vaGD2nZHYb8f9PxP/XOpPcBdkMqVWr9i2gnG+Sc7x9JQWYBmjobrWuniBN/s8d8fxuOVHokn5zwL1xaYO52zAShOgdb9uAHW2bG7nCq9a+A7y8rfXGOpfMmVdxsdJ7xDgAAcMQp27qh5G9AO9kgZ33/SCKTv7Ph09f3jyf51sE5MgIQhJK8eeSl2I3k+5tCY/i3qXlmJnUGtLkAXDlLydfJ30nthJNsuLySfH+huL0l369djCOtNTICEYRSnGg/EnvtP/n+JuHBjkCnYf8fMFkArJq+qo4DsTcFIt8/Lsr5/gokfy/6/s4Wn4DOdcytflF+MIJwmbeP/Cv6yX/k+1uIyxe+MXHnKTOzzVkAABjDq9Ebov6RhMvX+9t8FUP8WIpdXmkFn/n+chHzKN+vXURdAMJX1HUcw/LaNyzreNX3lw1jzLRXaLoAyMjIex1AS9cKEPmPJBTw/W3RTjbIPd/fKdRJ/qZCONL6j0TnOkqq/y4jKEEowbyDz6BTj7ifnKd9f3dO+ouI3ZKZp71jVsF0AbBk6pIWzpjpwEZID9/fmYf8iMT2lO9vOvmr6fvH2/F+7RLsbqySEZwgXOVI2wGsOhFx4x8nk78tvr+4iE0HyK/Pvrq8xayK6QKgew2zvez7K5H8pXwArEzyuO9vCu8kf6DrKYEv7HkK3FXLgiCs86/9T5zz/l2xWGXisl3LAE3DbCtKlgoAnh9YDIajXm39x4V8f2uQ72+NBL/MjjPbsKp2ibNrIQiJbDpdhg/rhZ9UGxfy/aNWcDh08HJL92e3VACUTS4LabBWgURDvr8tONX6EtYm39/MSacv7v0T2sNtMhZDEI4S1Dvw0v7fn9tAvr9JIrrUnL9Yekdp6rvyJsGaBQCAc/wDNmQx8v2taqeaZEPhQb6/UFyzkic7TqCk+gXryyEIh3nj8D9Q23646wfy/U0Slac44+yfVhUtFwDLZ6zeDcbWW9Uh31/6FPL9o1A8+QvGeuPgK9jTuN3SigjCSapbdmP+oX90/UC+v7W45w5+Vs6dVLnPqqrlAgA42wWwohD1E/n+CaZIgXx/t7Ca/IGuywKf3vkrhPROGUsiCFsJ8zCe2TMLIW7+/Uq+f2w4Bi7lDmFSCgA9L1ACwOQN5Mn3twXy/a2EsOXoP3lAcaqb96K05iXjEwnCYd449AL2N3d3rMj3N0n00T9naGjOzEn8PB4DSCkAyiaXNQN42aoO+f5WtVNNIt9fIIRSvn8i5tW8hD1NOySrEoQ8djVuw78PPdf1A/n+Jolp/UPT8c+3x21ulaEupQAAADD2F+OTyPeXPIV8/ygUT/4WYoX0Tvyu8iG0hprNixCETbSEmvDH3T/tuubfqW4aYFPyV8b37yJDf15WBGkFwPLpq7ZzYI34DLd8f3nJXxjy/aXESlffPxHH2w7jL7t+a12IICTz7N6HUdd+1PR8uQc/VnDZ94/97iubM2G7tNuCyusAAGCMPyM20uWH/DipTb6/FFFHbBaFff9ErKpdgiVH35QnSBAWmX/4Raw/2f2wWKda/wqc9GfnQdvZrYz/TWYUqQVAFvr+mwN1RuaQ729VO9UkZ3x/dZK/qRCe8P0TaT+/5wnsb9plYzSCEGNL/WrMqflT1w+ePunPmIgjrX+gVi/A6zIjSS0AFk5f2ME4ezb5qDh/UL8m/zTy/dXBv75/IomOcBt+VfED1AdNPRKcIKRwrK0Gf9z1U+hcJ9/fNAmTPwA8WzqmKgiJSC0AACAjA88ASLBI546Q4sZ1JfmT728lFvn+qSS6fueT7bX4TcUPox+zShAO0dTZgN9svx8toSbTGuT7R8fpFa4jHOApDq6NI70AWDxt1TGAz4vd4w/f39gCyPe3Ikq+v7G4O89U4M87H7UjEEEkpENvx2+3349jbTVdG8j3N0ni35kBr5ZOqDouNRxsKAAAgOvak8n2+9r3N5n8yfePFiXfPxYR7RW172Ju9d9tXAVBnCPMQ3hix4PY3VTetYF8f5Mkbf2D6fxpqeG6saUAeO+2VR+CI+K5j2nk+zulTb5/BOnn+yf7nV858CzePlxiPShBJEHnOv68+/+wpecRv+T7myRF8gdWvDqpaqvUkN3YUgAAAAPv7gKQ7y9FWwjy/Y3EkYkSyT9i4At7n8SqE0utByeIOOhcx1/2/B9W1y20pEO+f3SceOE4+FN2hbWtALhu05r5AKLuVUq+v+xYloaYFvFq8nfKr5MZ0EzyBwDOdTy54xfYclrCgzoJIoKu5P9zrDyx4NxG8v1NkvJ33jG6sOodqSEjCNglXFYGfvGXL+xgwO0A+f6mtYUnOXP0r07yNxXCB61/8UE617H+ZBlG9f04huZ+xPpiiLQnxDvx1K6fYk3donMbnfT9lTv4sULy1j8AcM4f/MuIOlva/4CNHQAAyGZ9Z4Ph3P0g/Zj8ndRWzvd382Qd8v1F4rSH2/Bw+few8dQq6wsi0poOvR2Pbf8e1p+MsJbI9zdJ6uQP4LDeD7aezGNbBwAA9r6yN3zJnSMCDJgCwIECwOe+f9yJHn/Ij1Ot/zTw/ROh8zDW163AyIJRGJ43wuLKiHSkJdSIR6u+jaozG6N3SDn6lzfJrta/G999nOHn8z5RtdaO0D3Y2gEAgLYQngXQQL6/rFiWhpgWUaf1T76/mVhBPYhfV/4I60+WmVsUkbbUB0/iFxX3YFfjtugdaeT7y0XoO+y03sZtv57X1g4AABwqORS85Csj8gF8Uqau661/8v2lxCHf36SEiTg617Gu7j30zxqESwsuNy5ApB217Ycxq+LrONJ2IHoH+f4mEWr9A4z9Zt71lcukho6D7R0AAOjsyPwDgAZZeq4nfye1yfc3Fds/yV/ePTQYgDAP46+7fo0X9jwBznVzQkRacKrjOB6u/AZq2w9F7yDf3ySCyR84k9MW+JPU0AmwvQMAANVzq9tHfvmiAgA3yNAj3598f6EQaez7p5qyu7ESh1qrMf68GxBgjnwNEB7iTOdpzKr4urTkT76/cPIH5+w3r9xQvlhq+AQ40gEAgIAW/gMA80+K6MaLvr9/kj/5/nYFdDL597DmxDL8svx7aO5sNC5K+Jb2cCt+WflNHG2rlqJHvr8hzgTCcOToH3CwAFg8bd1pxvBnKxqut/4VO+nP2fDk+zv3J3Hui6q8fiO+u/FO7GncLl+c8BwcHH/d8wvUtOyO3emk729KW56IW0f/AJ589fqKeqnhk+BYAQAAembnEzDZBXA9+TupTb6/qdj+8f3lxRGZdrKjFg9tvRfv11q7rSvhfd48/BLWnYxzC2k/+v6KJX/O0JDTnvFHqeFT4Kj5d+BfR9pGfuXCLIDdaHQu+f7k+wuFIN/f1JQw78S6uhWo7zyJawcUQqPzAtKOI20H8NSun0Dn4egd5PubxNCRPzSOR16+odz2M/+jYjoZDABCOVlPADhhZI7rFk1aJ3/y/e0KqEryj2Tx0dfxs63fwPG2wyYVCK/y3N5foVPvkKJFvr9hTrTonZYscjM4XgCUTS5rBsNvRce73von31+KKPn+xuJaWYDp9mj3xF2NFbh/05fwDj1SOG2oaNiA7Wc2x+4g398kxo7+OWe/fOu6XZZPkjeK4wUAAIRyMp8BcDDVONeTv5Pa5Pubik2+v1Xif6Y6wu14fu/v8VjVj+kqgTTgnaMvx24k398kxpI/gJrGhrbnpS5BEFcKgLLJZe2c4RFjs3zs+yuQ/O30/Y3hVvJPoC28w4q2W8VW6s/U2rrl+M6mL9IthH1MS6gR5fW9HhutoO9vDOVv9nNuBuc/Xzh9rxzvxSCuFAAAMLBp+EsAyhPtj/vCOdkid9L3jwv5/s6Svr5/Kk531OG3lQ/i0YoHUNd+3KYohFvsatyGEO+0rEO+v/FwnGGrfviKV2xfTAJcKwBK7ygNa+Dfj7fP9SMkxXx/Z+0K8v3T0fcX0d54aiW+u+mLWHBkHt1G2Eccat0XvcHTvr+xz5SdR/8iaDr7XukdpeHUI+3BtQIAAJZMX/sewOdHblPH91fnIT9ScMr3N538yfeXFSc15j9TraEWPL/ncTz44d2obIhz0hjhOZpDZ8794GTyd+rgR03fH4yhdE5xxftSl2EQVwsAAICu/QBAB6BI8neq9epX398U6Zj81fX9RbT3Ne3A/269F7+ufACHW6sNrYBQC72nm+OKxSoT7/j+ANo5z/iR1GWYwPW7fex/9WD9JV0PCppkp+9vV+vf9PLiTiTfXzCEcyf++dX3l3T0daS1BouPvo4znacxsmA0cgN5ZldEuMSBlp2oaNjg3NG/Ar6/XSc9i+uy35YUlb9hxzKM4H4HAEBrJ/8VA45FbyXf37nw5Ps7d9Kpt3x/EcI8hHePzMO962/H83sex8mOWsMrI9zjvOzzyfc3jaku9ZFwu/6Y1GWYxPUOAAAcKjkUvPQrIxoA3N61xa3Wvzq+v3NH/+T7e9X3t6v1b/bXDvMw9jRVYcGReTjefggj8i9BQWY/k2qEUwS0DCw6NtfQHPL9AZOtf4DhvnnXV22SuhSTKNEBAIDiDWteBLCJfH8vfQCskI7J3xu+v1XCPIQVtQtw38b/wG+rHsS2+g3grl7iSSRjeO5FKMjsb38g8v0BYPPoiZWuXfbXGyU6AABQVgZ+6X9eUAXG/gvM1hyYYBD5/lZike+fSsJl398W3zW5CIeOw63VKKtdgFUnFqFDb8eF+SORpWXLiEJIgoHhYMse1LTuERzfG/L9BeGM8S/++cK6GjuWYgZ1Dgi7mfLupHlgfKZVHTt9f7uO/qX9MeIIqZP8jcX2qu8vZLN42PdPLRL/tc4J5GLCoE/ihiG34JqBhQiwDBlRPU1LqAn7mrfjRPsRnA6ewKmOWjSHmqCxrgZtfkYB+mcOwoj8SzEi72MYljsCAclPa1xdtxB/3P3TlOPUaf2r4/sb0H65pKjyLqlLsYhyn74AC/8oDO1WALlmNRw5GpUyia73FwjhbOtfAnb6/sZwOPn3jhtHuz3chpUnFmHliUXom9kfxYNvwvVDpmF036vPJjy/c7j1ACoaNmBn41bsa96O422HunYI/hGytRxc1X8ixg68AWMH3oABWedZXtM1A4oRYAGEez8KOAJ1kr8xEUWSf0uAaakrLIdRrgMAAFPeLf4xDDwxMBLjvn863udf/da/731/24/+5Vzvb4gUR//JKMjsh2sHFGHcoOtxzYAiX508eKbzNLbVr8fW+rWoaPgA9cG6+ANNvidG9b0GU87/PIrOu9mSvTKr8h5UnUl8bppQVyv5JLNDeiH+mVIk+QPgD5QUVT0pdTkSULIAuHHFjRmZ7cH1AMYanUu+f6rN6if/KG3JBUB6JP/u2B5J/r3RmIbLCq7EmP6fwOV9r8GoflehT0Zfqyt0jDAPY1fjNmytX4ut9Wuxv3kXOLputiP3/Rf9WvfJKMANQ27FjOF3YmjOhYbVFh0rwd/3xz/uIt+/O7a5zufG8KHLi9y85W8ilCwAAGDqouuu1rm+EUCm6Bzy/VNtSu/kn1CSfH9rSEz+8eU1XJh/MS7vew1GFozGiPxLMCL/UuQF8iVFsEaYh1HTshs7G7ehsmEjyhs2oC3cEjNOfvEZ/3tEYxoKB03BZy/4Gi7uM1pYrT5Yh3s3Tj1brCReXpom/whRA9ohcH1CSfH2LVKXIwllCwAAuGlh0eMM7IciY421/tVI/qa1BWKpk/yNxfZ1699kHLta/3KLTwfOsej1/huSMxwX5V+KYbkjMCR7GAbnDMeQnGEYnD0MeRl9pIfv1INoCjXgSGsNjrbV4GhbNWpa9mBPUyXaw62iyxfYKILY6/2JAdfhixd9GyP7XCGk+n8VX8XOxq1JdBVr/aud/MGAR+cUVf6v1OVIROkCoGheUW6fAlYO4NJk48j3F9ms/tG/r5O/yVh+9v3NxBF9rXMCeSjI7Ic+Gf3QJ6Og69/MvshkmcgOnDu/OFvLgcYCaAu3gHOO1nATgK4z89v1NjR1NuBMZz2aOuvRFpPkJXyPSGj9p5JgYJh43qfxxRHfxgV5I5OOXXD0Fbx04HcJtBVL/gmEVEn+AN+d095y9UuTq9ulLkkiShcAAHDTwutuZNDfg9UC2qnkn3AiJX/BENILgPRI/t2x/Zj8I0RNJSRxeQOL90byjxzIoKHwvE/jP0d8B8NyR8QdVtt+GPdtvjWBdpq2/s11PjnT+E1zJla9J3U5klHmRkCJ2P/KweqRd104ggHXxtsv9EcxkfyFtU1Mktt6TbUpvZN/QklJfwShhORU8hec6I/kb0sIwSBuJX+TEhF/q8Ot+7HkeClOB0/go31GIS8QbZX0yeiL1ScXoiXyEcHdc2UtyFPJP0LUiDZneK6ksOpPUpdjA9648DbQ8QCAo703eyf5O3O9vzrJ31QIZ1v/EjD2/rMT9a73l4bB1r+FENKTf+qARjERO06sMA9h6fF/475Nt+Jv+36J+uDJqP1jB1xnPa74cqSJqJL8wXEs0MmUu+Y/Hsp3AABg/+xjHSPvGnGYAWfvEGi8+hXHzuTvnQ9AtKhdR/+uJH9ftf7d9P0l6yYQVSf5m9QW3pEME98jKQbp0LG/eQeW1JaiPdyGj+aPQnag65yIlXXvxI1rNpbgkF540fcHANw957pKJc/6740jxyeyuGlR8RuM47NmWl+Gpxgl7kTy/QVDSC8AKPlb1U4lQr6/kLbwDvG4dh38ZAdycdPQz+OWYV/CD7d+sfvKhjRt/ZtP/u+UFFXeJnU5NuKpAmDKkknDEebbGJD63peKtf4p+ScM4dzRv6+Sf0Rsp1r/rif/2NgSQkhv/Xsx+UdOyWCZCLAAOvQ2aXE8lfwjRA1q14UD/KrSCVXHpS7JRrxxDkA3S29ec5Rx/vWUAxVL/naiTvI3FcJzvr8QjiyAkr+EEB7w/Z2JFTklxDvFkr99yxEWUSj5A+D3eCn5Ax4rAABgyfR188HwvGxdO5O/nR+AZHFtD2cytq99f5Nx7Gz920V6JH+T2lKQ7/ubiWslliPfI1Kw7Ps/U1JU9Za89TiD5woAAADr830Au+Lv6/mPy28kmdqOVL9WROWcnWwV15O/NO1kqOP7Owf5/o5042yflAq3TvqLFjWhvaMlM/tBuYtxBk8WAEumLmlhTL8TQDBqh5PJ3/HWa6rNHvP9pSDvBCVjEm76/g5rK9H6tydOajyW/KW8/7xx0p9cLH13dnKd3/32uM2p7wWtIJ4sAABg8bT1HwJs1tkNTh6lkO9vJQT5/qYh319CCEHU8P2VS/6mteWJKNX6Z/jZ3ElVG2WuyEk8WwAAQPGGNY8BMH2rRfL9TYQzGZt8f6vTyPeXEMKWz5TjXS1bFkC+vwnt90dPrPyDvPU4j+sHTla55d2JF4S1wDYAA+l6f2uxbG/9S3u30fX+8rRTiThz9K9O8jcW2/XWv7TiU/3Wv2LJvz4c5teUXld1UN6anMfTHQAAWDh9w2GNs69T8rcWi3z/VBLk+9t59G87fkz+JvFi8lcNBnzT68kf8EEBAACLblnzOgN7ydYgyrVeyfd37k+iwAlK5PtbCSEI+f5WSBffnwMvzCmqnCd1SS7hiwIAALI72P0AdqQaR76/iXAmY/vH95cXh3z/aFF1Wv+Kd7VsWYBivr8Hkj+Ayqw87Xvy1uMuHmi2iPPpBRMuCwQCHwDoF28/tf5jRcn3TyVBvj/5/gm0hXeIxyXf34quYFyTyZ8BTTowcW5RZcoDTa/gmw4AACyf8cFuBnY34rzDKPnHipLvn0qCfH/y/QUlyfcXRA3f30Q4rgNf9VPyB3xWAADA4mlr3wTHY1LElGu9ku/vRd/fdHuUfH8rIQQh398KXvX9jcMenVtU+bqs1aiC7woAACjesO4hAIt6fibf30Q4k7HJ97cK+f4SQpDvbzUu+f6Ra1kWPjR6lswVqYKvzgGIZOqiooEc2MSAiw1PViD5q3P0n47Jn3x/8v0TaAvvEI9Lvr8VXcG45jufNSwzOG7OuN0n5a1JHXzZAQCAxdPWneYa+zxnkPRcS0r+yuGr5O+Ctuu+vw3vLz8mf5N4MfnbiYlw7RpjX/Br8gd8XAAAwNKb125lnN1raJJTvquwNvn+cSVt+WXI93e29S89hCDk+1vBzuSvku/PGfv2q4UVm+WtRz18XQAAwOJpa2czjueEBgu2/qXglO9v+stX8da/BMj3j4Z8/yTaUnDG9zf9WjtefNqgfRbLN/v569zCihelLklBfF8AAADj/e8H8EHyQYl2uNn6dwvFk7+TrX8p2slQx/e3C3WSv0lt4R3JcM73N4WTHTXbw1v0/RnW6X3592WuSFXUyTk2M33B+PPDgYz1AC6KO0DAoyTfP2EIT7X+1fL9uRLJ37mjfzrpT7nWvwK+v10FgInPYzVjrHBOYWWt1CUpSlp0AADg3Rkbj2u6Ph1AQ8xO8v2thPBU8k8V10osR2wWK7ie/N2EfH8reDH5m6AxwLXb0yX5A2lUAADAwukbtjPOPwcgeHYj+f6mYpPvbxWHT/pzUtuPvr/pF4p8/2QiCrX+O3WwL7xSXFEhdUmKk1YFAAAsumV9GcC+CYB8/ygUT/5p7PtLwSnfX7nkb1JbCuT7OxfeUvLnDPzr84oqlkldkgdIuwIAABZPW/sigF/G30u+v1sokfwdaf2LT/Jc6z8u5PsrZyEq4PvbhYlwD88pqvqn/JWojzoHoE7DwaYuLfonOO7qvaMHaS9OHCF1kr+x2F71/YVORHPS93e89eqm75/erX/lfH8Fkr8qR/8MKJlTWHknmCJHQQ6Tlh0AAAADPzkw+N/gWH5uI/n+AiHI9zeNW74/JX9h7ZQb5cc2G0sdS8uYiDLJn2FlQ337V9M1+QPpXAAA2Dxuc2c4EPwCgEry/ZNDvr+IdjLc9P2diaNO8jepLQW3fH83T/rzpO+/g3Wyzy6cvrdD6pI8RloXAACwbMrmMxzh2wGcvfSDfH/nUCL5k+9vA+T7u97VkjIpFS77/uaSf12Y89tfvb6iXv6CvEXaFwAAsGTqBwd0pt8K4IxyJ+sIitqZ/O08+k8eUCYK+P62aCcToev9TWFL8SkvFvn+SWKn5gyHNq20uGqvzNV4FSoAull68webmK7dAqDZspjyJ/0ZDkG+v2nI95cQgnz/hFPI9zeg3QpNu21uUfmHUpfjYagAiGDRLWvXgbHPAmg3LaLOoVACyPeXq50M8v0lhCDfXzCulVjKd7V6xzWe/IOM8y+UTCxfJXU5HocKgF4sunndcs5Z9N0CRSHfXwglkj/5/jZAvr/rXS0pk1LhOd+/k4H/x5wNl8SHAAARhklEQVTiqkX2LMi7UAEQh8XT1i3inN8JICQ8yWfJn3x/q1PI93cOjyV/8v1NYuq7M8wZ/39ziqrelroUn0AFQAIWT9vwGoB7AOhmNdRJ/qZCkO9vGvL9JYSwxfdPHtAByPc3ianWPwf4t+YWVpVIXYqPoAIgCYumrv8n5+y7KQeqcyiUAPL95WonQw3fPz2Sv0ltKZDvL1dbIK7Bgx8O9mBJUdXzUpfiM6gASMHiaev+DOCBhAN81vo3EcCapK98f2PJ387Wv3OQ7+96V0vKpFR4y/fnjP10blHFH2xbj0+gAkCARVPXP8mBR2N2+Cz5O+7X+Sr5u6BNvr8QSiR/8v1NYuK7k/Nfzi2s+K3UZfgUKgAEWTx1/f8yjp+kGqdO8jcVwnO+vxB+9P2VSP7k+9sVSx1Ly5iI+61//lhJcdXPpS7Dx1ABYICF09Y/drYIcOqLqhtH/Do/+v4m4yjv+8chPZK/SW0pkO8vV1sgroHkzzn7RUlRVcqDNOIcrh+ceZGpSwq/yYC/oFcBpc7Rv4nWv7R3wrnYrid/k7G86vs7VwCQ70+tfyu6grHFv/s44/yBOcVVT0lfhs+hAsAk05ZM/ArAXgSQAXg8+RsPIhQ7rqSvkn9EbGr9mw9ByT/JFPWTv3Ftwdhi339hcHyjpLjyH1KXkCZQAWCBqUsL72AcLzMgM3qPm74/tf6txLHr6J+Sf8IQtthpcotPga6WhFimX2unWv/qJf9OztmX5xZXlEpdQhpBBYBFpi6dMEPj2r8B5HRtkfQFySj5i0mon/yNa6cSMZGQTMTxVfIXjpU8tp2+vymbJX2Tfwfj7EtziivmS11CmkEFgASmLS28kQFvgaPAU61/8v1NTlEj+UvTjhNLneRvLLY/kn9sbCuxvOH7G0r+LYzhc3MKK5dKXUIaQlcBSGDRlPVlHHw6wM9YFnPS95cCXe9vu7YLrX/b8WPyN4kXk7+LnAHHzZT85UAFgCQWTdmwmoHfBOCEaRHTvr/hEM62/qVDJ/15vvUvhBrX+yvp+5vSlifi0tH/cQ7tUyXFlWulhk9jqACQyLs3f7ApzHkhgB1mNcj3NynhSPVB1/tLCOGs728Kt26fTb5/Im0GbAcyiuYWlX8oNXyaQwWAZJZM/eCAFsycBKDM0EQJbUr74piUdLL1L0U7Ger4/nahTvI3qS28Ixlu+v72xUqO4jf74ey97PaMSSVFW6ulhieoALCDBbeuru/T0DyVA7OFJpDvLyhBvj/5/oKS5PsLoobvnzgc+2e4n37LS5O3Nji4nLRBrdM7/AYHm76k8Bec8Z8j0Wtt2vdPt9Y/+f7U+k+inXKjsdhK+v7S339K3+yHA3ikpLDyYTCHWmBpCBUADjBt8YS7GWPPAciK2cko+YtJ0PX+0vFj8heOlTy2Xa1/dZJ/gthqJP8g5/zrc4ur/iU1LBEDFQAOccviCZ8CY68B6H92o82tf/m+K13vL087lQhd7y+kLbxDPK6zvr/6rX+Hk3+9zvgX5hVWrZAalogLFQAOMnXR+DGapr0D4KOO+v5OHf37KvlHxE6b1r/cTiuLDZAEDyV/k7G8mPyNawvGjt/5PMCBGXOLKk1fRUUYg04CdJDF0zZWsUy9CAwbAIdOMvJQ8k8V10osSv6xoo68/4Sg6/2t4MXkHyfQOsZQRMnfWagAcJh3J288js6Bn2QcTxubqbjvLwE7W6/GoOv9JYRw1vc3hTOX0arl+4uLONb65/y5cAG/cU5hZa3UkERKyAJwkRlLJn6FM/wNQF7ykYonf1+1/sn3tyjf6z+p8FDrn3x/kyRM/u3guK+kuPLvUsMRwlAB4DK3LC26lkF/DcDF8UeQ728llqnWv4+Tf6w2JX/lWv/p4fsf4jr/wtxJVRulhiIMQRaAyyycsm5LNuPjASyxquXF5J8qrpVYpn1/W7STifjD9zcG+f5W8GLyj9Bfkalr4yj5u4863wfpDgebsbTwR5zxX+NsYUatfytx7Gr9S/vQxCkAyPdPop1yo/HYdrX+1fL9lbnenwP88fChKx4qvaM0LDUUYQoqABRj+rIJt4Kz2QDvn3p0F75O/iZjke8fLahO8jcW2/XWv5TiU17yNzAseWyHfX8NaNKBr84tqnxdahjCElQAKMitSyZ+TGf8dQAfFxlvVwGQHsm/O7Yfk3+EKPn+5PunErHR99/Jgc/TJX7qQecAKMg7N2/Y05qRVwTwF1ONtfPoP3lAmZDvT76/IH70/X2c/AG8kJmnjaPkrybqfDcQcZmxdPzndbDnGDCo9z5ft/597fu7mfzJ9yff36q2QFwNDQD/1tzCqhKp8oRUqADwANNXjD8fIfYigGk923yd/E3GIt8/WlCd5G8stuutf8V8f2ldLYd8fw72XqbG7n6lsPywVHlCOlQAeAUONn3pxPvB+OMAssj3tzqFfH+L8v5M/iZjUesfAHgnY/j16MLKR2Yx6FKlCVugAsBjTF9adCVD6BWAXenY0b+kd4lQQnLS93eq9e968o+NLSGE9Na//OLTxOWVlPxNwneCaV+eW1T+oVRZwlboJECP8e6UdRV5+RkTGWNPw/K3Ot3nPxm2eKO2aEeLejH5pw5oFMXv829KW56I5Pf27Kx8bRwlf+9BHQAPM33Z+GkM7EUA5xufTb6/XO1UIuT7C2kL7xCPS76/Ve2E1DGm31NSVPWWPEnCSagD4GHevWnjolAo/AkAb1rRSY/kb2ySp5J/Qij5u97VkjIpFfI+UwYivqFn6FdR8vc21AHwCbcuH38b5+yvAC5IPZp8f7nayUSo9S+kK7xDPC75/la143IcYD+eW1z+L+tShNtQAeAjblo6tl8Oy3iEg9+HhN0dxVr/UlqvqaDr/SWEsMX3l1t80vX+yUQsvv84wF4OBoLff2PizlPWpAhVoALAh8xYNuF6MPYcOB8dvUex5G8ylhd9//RI/sZiu370T76/KPsY2L0lxeXLrckQqkHnAPiQBTd9sKpFy72WcTwMIBhvDCV/q9qpROQlYWNQ8iffXxohztjTWfnsakr+/oQ6AD7n9mUTrwoDzwP6hMjtdvn+6iT/iNjk+1sJQb5/wil+9v3ZVl3j95QWVmw2NZ3wBNQB8Dlv3bShvCWQOwkMPwTQCihQ9TmyAEr+EkLY4vsnD+gATvr+prTliZjQbgHY9/XDo8ZR8vc/rucCwjluXV70Eejh34Dxu2J2pulJf8a1U4mQ7y+kLbxDPC75/pa0OYB/B3joh69O2lFjeFmEJ6ECIA2ZsWziZMb0p8HxcQA+a/2rkfylaSeIZSohicv7M/mbjOXF1r8RXQZsDmva90oLt602tBzC81ABkKbcuOLGjD7hlv9hDA9zoJ8VLXWSf0Rsav2bD0HJP8kU9ZO/Ae2jDHh4dFHFC7Po4T1pCRUAac7tyyYO5dAf4Qz/DSBgRsOLrX9K/glD2OL7yz3pVOGH/AjGktL6N5/82znnf+BB/pvSyVXNhpdC+AYqAAgAwG0rxo6Grj3CgZlG5nkx+RvXTiWSbr6/hOQvHCt57LT1/U0nf/ZOIMy/++r1FfsNL4PwHVQAEFHMWDb+JsbwewBXpxqrTutfjeQvTTtOLHWSv7HY/kj+sbGtxHLJ99+iA98vLa5431B4wtfQZYBEFAtu2rgs99RHxwL4L4AlPBtYneTvgrYLrX/b8WPyN4kXk38SqgF2t3549HhK/kRvqANAJGTmvDFZreflfbX7joJRjxwWao/SSX9SYqlz9E++v5VYjrb+OT/JwH6fE2z640uTq9sNhybSAioAiJTcvPiq/MyMnPsY+E8A9CffPyK2LN0EcXyV/IVjJY9Nvn/SzU2c4a+ZrO3XrxTubTQclkgrqAAghLl99aQC3tH5bXQXAl1byfcn3z+BtvAO8bjk+yfc1MQZ/poRwmOvXl9RbygckbZQAUAYJqIQ+DHAB8QMoNa/lFi2FwB+TP4mY3kx+XdvpsRPmIYKAMI0n11xTf+QnvFdBtwPYCAASv6SYqlz9E++v5VYNib/0xrwVDgr6+nScZvPGApDEN1QAUBY5sYVN+b04c13MOBnAEYZne/F1j8l/yTawjvEY9vV+lcn+SeIHStyHJz9jWdnPkmJn7AKFQCENGbNgrbp+vEzwPhPGFAsMseLyV+adpxY6iR/Y7G9mPzjT1O29b+Xg/05v6Pxb3RWPyELKgAIW7htxdjroLMfgOF2JLjfBLX+Y0VNnYVuJIQfk7/JWF5I/hwoA2NPlhaWvw0m+Q1BpD1UABC2MmPZ+JGahu8C/B4AeT3bKfnHiqpz9E++v5VYEpJ/EAxvaow9UVJUvsGQHEEYgAoAwhFuWXnt4IxQxrcA/A/Ah3ix9U/JP4m28A7x2Gno+9cC7NlAQH9mTmFlrWEpgjAIFQCEo8ycNyarY1DOZ8DYNwB8Ginfg2okf2nacQTVSf7GYnsx+cef5nLrn2EzB54D+swuLV7XZkiCICxABQDhGre/N24U4+xrnPF7AAyKP4r7M/lHiNrl+/s6+ZuMpVDyb2RAic7w59LiigpDUwlCElQAEK5z8+Kr8rOzsmcy4L/A+XU4+74k319CCPL9E05xvPXPAawEx4ttOZmlb4/b3Co2jSDsgQoAQik+8/74C3Vdv5Nx3AvgYseSf5QQ+f5C2ik3Go/tU9//CMBe5iz0Qmlx1V6xwARhP1QAEEoyaxa0LTd8Ygpn7C4AnwWQn2isp47+lUv+xmK73vqX4vvLS/5JhjUDfD6DNvvy4m3LZjHoYmoE4RxUABDKc+OKG3P6scYpnLO7wPAZcGT17PNU8o8QJd/fl75/GBwrmIbZekf49dLJVc1iKgThDlQAEJ7ic8smDNID+n9wxu9gHJ8EELAk6Hryj40tIYSnWv8eT/4hcJSB8Xmc6a+VFledNrA8gnAVKgAIzzJzUdHAYFbnrZzxmYzh5sjOgDAMoORvQDvlRuOxPej7hxnHeq6hNEPTS+iafcKrUAFA+ILPrrimP1jGbZzrnwHYzQAKUk4i39+YtvAO8bje8f15I4O2GMBbPDvjbXoQD+EHqAAgfMfMeTMDocH7i3TgVgC3A7g8ZpDrrX9K/h5o/e8H2DKm83f4wPDi0jFVQeMrIQh1oQKA8D23rRg7OgA+jTM2BRyfBOu5ooBa/0K6wjvEYyua/JsB/j4YW6qF2cK512/bbTw6QXgHKgCItGLmvDFZnYNzi8HCN3OwKQCuBRCg5J9EO+VG47EV8f3DAP8QnC1BgC9FP30dHeUT6QQVAERaM3PFmD5BZBUysOvAMAnADYCJkwl7o1zyNxbb9da/Pb5/GMBWzrEG4KtZQF9OZ+0T6QwVAAQRwcwVY/p0ajnF4Pp1AJsIYCKAfoaFyPePG9fh1n8DODYwYD3AV2e3snWzp5a3GFcmCH9CBQBBJGEWh7Zl1bWjobOJDChEV0FwBYDMhJOUO/pPi+TfCaCKARs4Y+s1LbRhbmHlTjCJLzpB+AwqAAjCIN/YNDbzWGPoMi2gjQXHWDCMZZxdDaCPl5N/Qkn1fP9mgO3ijG/XdL4ZjG2GlreZHqVLEMagAoAgJHH76muHs05cwTRtjAZ+BQcfA7CrAJ76ngSC+Lr1HzuoA8A+MFRBZ9sBVHHGt185aduOWXRvfYKwDBUABGEnHOwzK8dfEODBS6GxSzhnlzLgUg5cArBLjBQHPk3+jei63n4vZ3wvA98Hru3VM/W9r08sP0ItfIKwDyoACMJFZqy6ckCGnnWBpvGLeJhfyDR2AQe/kHEMB9hQgA8GMBiA5jHfX2dAHQPqOFDLgaOMsUMc/BDjOMx0vaZTDxyaP3lrg5koBEFYhwoAglCcmfNmBjC4enBQ0wdr4IMZ4wMB3p9z9AfQX9PQn3OtP7ieB8YKAJ7DgFzOeD44ywLQjwFajx4HcgDk9vzc/SXQBqA9IqwOhjMADwKsBWCtAO9gQJPO0coYGgA0MIYGHaye6WjQebg+A7wOul435saqE9SmJwi1+f/jRHcc+IqZaAAAAABJRU5ErkJggg==';
    
    readonly supportedTransactionVersions = null;

    private _connecting: boolean;
    private _wallet: any | null;
    private _publicKey: PublicKey | null;
    private _readyState: WalletReadyState =
        typeof window === 'undefined' || typeof document === 'undefined'
            ? WalletReadyState.Unsupported
            : WalletReadyState.NotDetected;

    constructor(config: WechatmpcWalletAdapterConfig = {}) {
        super();
        this._connecting = false;
        this._wallet = null;
        this._publicKey = null;

        this._readyState = WalletReadyState.Installed;
        this.emit('readyStateChange', this._readyState);
    }

    get publicKey() {
        return this._publicKey;
    }

    get connecting() {
        return this._connecting;
    }

    get connected() {
        return !!this._wallet?.isConnected;
    }

    get readyState() {
        return this._readyState;
    }

    async autoConnect(): Promise<void> {
        await this.connect();
    }

    async connect(): Promise<void> {
        try {
            // if (this.connected || this.connecting) return;
            // if (this._readyState !== WalletReadyState.Installed) throw new WalletNotReadyError();

            this._connecting = true;

            const wallet = {
                address : "",
                disconnect:async function()
                {
                    console.log("🚧 Wallet disconnect ")
                },
                off:function(action:any,data:any){
                    console.log("🚧 Wallet.off ",action,data)
                },
                publicKey: Uint8Array,
                isConnected: false,
                signTransaction: async function(transaction: Transaction){},
                signAllTransactions: async function(transactions: Transaction[]){},
                signMessage: async function(message: Uint8Array) {},
                connect: async function(){},
                
            }
            const wechatmpc_wallet = new Wechatmpc();
            
            try {
                wallet.address = await wechatmpc_wallet.connect(solChain,"");
            } catch (error: any) {
                throw new WalletConnectionError(error?.message, error);
            }

            if (!wallet.address) {await this.disconnect();return ;};
            // if (!wallet.address) throw new WalletAccountError();


            let publicKey: PublicKey;
            try {
                publicKey = new PublicKey(wallet.address);
            } catch (error: any) {
                throw new WalletPublicKeyError(error?.message, error);
            }
            this._publicKey = publicKey;
            this.emit('connect', publicKey);
            wallet.isConnected = true;
            this._wallet = wallet;
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        } finally {
            this._connecting = false;
        }
    }
    async disconnect(): Promise<void> {
        const wallet = this._wallet;
        if (wallet) {
            wallet.off('disconnect', this._disconnected);

            this._wallet = null;
            this._publicKey = null;

            try {
                await wallet.disconnect();
            } catch (error: any) {
                this.emit('error', new WalletDisconnectionError(error?.message, error));
            }
        }

        this.emit('disconnect');
    }

    async signTransaction<T extends Transaction>(transaction: T): Promise<T> {
        try {
            try {
                const txs = [];
                    if(transaction.constructor.name == "VersionedTransaction")
                    {
                        //Versiontransaction
                        {
                            txs.push(
                                {
                                    t:1,
                                    d:encodeBase58(transaction.serialize())
                                }
                            )
                        }
                    }else{
                        txs.push(
                            {
                                t:0,
                                d:encodeBase58(transaction.serializeMessage())
                            }
                        )
                    }

                
                var s = await (new Wechatmpc()).send(solChain,txs,"",true)
                if(typeof(s)!="object")
                {
                    s = JSON.parse(s)
                }
                let newTx;
                for(let i = 0 ; i<s.length ; i++)
                {
                    if(s[i].t == 1)
                    {
                        //version transaction
                        newTx = VersionedTransaction.deserialize( Buffer.from(s[i].d,'base64'))
                    }else{
                        newTx = Transaction.from( Buffer.from(s[i].d,'base64'))
                        
                    }
                }
                return newTx as T;
            } catch (error: any) {
                throw new WalletSignTransactionError(error?.message, error);
            }
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        }
    }

    async signAllTransactions<T extends Transaction>(transactions: T[]): Promise<T[]> {
        try {
            const wallet = this._wallet;
            if (!wallet) throw new WalletNotConnectedError();

            try {
                const txs = [];
                for(let i = 0 ; i<transactions.length ; i++)
                {
                    if('message' in transactions[i])
                    {
                        //Versiontransaction
                        {
                            txs.push(
                                {
                                    t:1,
                                    d:encodeBase58(transactions[i].serialize())
                                }
                            )
                        }
                    }else{
                        txs.push(
                            {
                                t:0,
                                d:encodeBase58(transactions[i].serializeMessage())
                            }
                        )
                    }

                }
                var s = await (new Wechatmpc()).send(solChain,txs,"",true)
                if(typeof(s)!="object")
                {
                    s = JSON.parse(s)
                }
                const newTxs = []
                for(let i = 0 ; i<s.length ; i++)
                {
                    if(s[i].t == 1)
                    {
                        //version transaction
                        const newTx = VersionedTransaction.deserialize( Buffer.from(s[i].d,'base64'))
                        newTxs.push(
                            newTx
                        )
                    }else{
                        const newTx = Transaction.from( Buffer.from(s[i].d,'base64'))
                        newTxs.push(
                            newTx
                        )
                    }

                }

                return newTxs as T[];
            } catch (error: any) {
                throw new WalletSignTransactionError(error?.message, error);
            }
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        }
    }

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
        try {
            console.log("🚧 signMessage : ",message)
            const wallet = this._wallet;
            if (!wallet) throw new WalletNotConnectedError();

            try {
                const signature = await (new Wechatmpc()).sign(solChain,encodeBase58(message),"",true)
                return signature;
            } catch (error: any) {
                throw new WalletSignMessageError(error?.message, error);
            }
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        }
    }

    private _disconnected = () => {
        const wallet = this._wallet;
        if (wallet) {
            wallet.off('disconnect', this._disconnected);

            this._wallet = null;
            this._publicKey = null;

            this.emit('error', new WalletDisconnectedError());
            this.emit('disconnect');
        }
    };
}
