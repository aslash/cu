// Learn cc.Class:
//  - https://docs.cocos.com/creator/manual/en/scripting/class.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html

cc.Class({
    extends: cc.Component,

    properties: {
        // foo: {
        //     // ATTRIBUTES:
        //     default: null,        // The default value will be used only when the component attaching
        //                           // to a node for the first time
        //     type: cc.SpriteFrame, // optional, default is typeof default
        //     serializable: true,   // optional, default is true
        // },
        // bar: {
        //     get () {
        //         return this._bar;
        //     },
        //     set (value) {
        //         this._bar = value;
        //     }
        // },
    },

    // LIFE-CYCLE CALLBACKS:

    // onLoad () {},

    start () {

    },

    onClickOpenUnity () {
        console.log("onClickOpenUnity...");
        let obj = {
            name : "cu",
            number : 1000
        };

        let params = JSON.stringify(obj);
        if (cc.sys.os == cc.sys.OS_ANDROID) {
            jsb.reflection.callStaticMethod("com/tencent/abcmouse/unity/UnityLauncher", "start", "(Ljava/lang/String;)V", JSON.stringify(params));
        }
        else if(cc.sys.isNative && cc.sys.os == cc.sys.OS_IOS) {
            jsb.reflection.callStaticMethod("CUBridge", "OpenUnity:", JSON.stringify(params));
        }
        
    }

    // update (dt) {},
});
