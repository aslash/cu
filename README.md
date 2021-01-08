### 1.背景
项目本身使用 Cocos Creator 开发，合作方使用 Unity 开发了一系列课程内容，希望能够在产品中直接使用 Unity 形态的课程，快速接入，无需改造。

### 2. iOS 应用程序基本架构
在此之前，笔者并未从事过 iOS 原生开发，以下都是在分析 Unity Xcode 工程时做的简单总结，不保证准确性和完整性。
#### 2.1 UIApplication
一个 iOS 的应用程序关联一个 UIApplication 实例，用来管理和协调其它的实例，通过 UIApplication 可以获取和操作 AppDelegate 和 Window 对象。

#### 2.2 UIApplicationDelegate 
顾名思义，这是 UIApplication 的代理，UIApplication 通过 UIApplicationDelegate 来履行职责，比如创建窗口和 View，添加View，管理应用的生命周期等。

#### 2.3 UIView 和 UIViewController
UIView 是所有UI 控件的基类，UIView对象负责屏幕上一个区域的显示样式如颜色、大小，以及动作等。UIViewController 负责 UIView 的创建、加载与卸载。

#### 2.4 UIWindow
UIWindow 是一个视图控件，用来承载 UIView，将 UIView显示到屏幕上面，可以通过 `addSubView` 的方法将 view 添加到 window 中，或者设置 window 的 `rootViewController`，添加该 ViewController 对应的 view。UIApplication 中有多个 window，通过 `makeKeyAndVisable` 可以将 window 设置为 keyWindow。

### 3. Unity导出XCode工程分析
我们来整理一下 Unity XCode 工程的结构

#### 3.1 XCode 工程整理结构
新建一个空 Unity 工程和空场景，在PlayerSettings中切换到 iOS 平台，使用 **il2cpp** 的模式导出，得到对应的XCode工程目录结构如图：
![Unity XCode工程结构图](https://upload-images.jianshu.io/upload_images/13097306-176506dcc47602cd.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

* **Data 目录**
包含了序列化后的场景和场景资源，名字诸如`level`以及`level.resS`;
子目录 Resources 包含了Unity工程中 Resources 目录下的资源序列化结果;
子目录 Managed 包含了 .NET 程序集数据(dll/dat文件), machine.config 文件包含各种 .NET 服务设置。在每次重新构建时，Data目录都会被刷新。

* **Classes 目录**
包含了几乎所有 Unity 生成的源代码。在**PlayerSettings**不变的情况下重新导出，将只有 Native 子目录会被刷新，其它目录不会发生变化。

* **Frameworks 目录**
包含工程用到的所有 .framework 库文件，重新导出不会刷新这个目录。

* **Libraries 目录**
包含静态库文件 libil2cpp.a 和 libiPhone-lib.a, 以及将 Unity 本机代码与 .NET 绑定的 RegisterMonoModules.h/cpp，每次重新导出都将刷新这个目录
* **Products 目录** 
存放工程构建结果.app文件
***

#### 3.2 Classes 目录
列举一下 Classes 目录下比较重要的文件和子目录
* main.mm
应用程序的入口点，关键代码如下
```
const char* AppControllerClassName = "UnityAppController";

int main(int argc, char* argv[])
{
#if UNITY_USES_DYNAMIC_PLAYER_LIB
    SetAllUnityFunctionsForDynamicPlayerLib();
#endif

    UnityInitStartupTime();
    @autoreleasepool
    {
        UnityInitTrampoline();
        UnityInitRuntime(argc, argv);

        RegisterMonoModules();
        NSLog(@"-> registered mono modules %p\n", &constsection);
        RegisterFeatures();

        // iOS terminates open sockets when an application enters background mode.
        // The next write to any of such socket causes SIGPIPE signal being raised,
        // even if the request has been done from scripting side. This disables the
        // signal and allows Mono to throw a proper C# exception.
        std::signal(SIGPIPE, SIG_IGN);

        UIApplicationMain(argc, argv, nil, [NSString stringWithUTF8String: AppControllerClassName]);
    }

    return 0;
}
```

* UnityAppController 工程中最重要最核心的一个类，管理 Unity Runtime 初始化、窗口和视图的创建、事件分发、生命周期管理、渲染API等重要功能。UnityAppController 被分成了以下几个子模块

子模块 | 作用
---|---
UnityAppController | Runtime初始化，应用生命周期管理
UnityAppController+Rendering | 渲染
UnityAppController+UnityInterface | 提供暂停状态设置和查询
UnityAppController+ViewHandling | 创建splash和游戏视图，管理窗口旋转

* Classes/UI 目录 
基本的界面控制，UnityAppController+ViewHandling在这个目录里面
* Classes/Native 目录 ，Unity工程中的所有“业务代码”，在 il2cpp 阶段生成的cpp代码都存放在这个目录

* Classes/Unity 目录 一些 iOS 平台特性相关接口，以及libiPhone-lib.a 中库方法的声明，比较重要的是 UnityInterface.h，包括 Unity 生命周期接口、传感器接口、分辨率/旋转处理接口等。贴一下其中我们比较关注的关于生命周期方法的声明：

```
// life cycle management

void    UnityInitStartupTime();
void    UnityInitRuntime(int argc, char* argv[]);
void    UnityInitApplicationNoGraphics(const char* appPathName);
void    UnityInitApplicationGraphics();
void    UnityCleanup();
void    UnityLoadApplication();
void    UnityPlayerLoop();                  // normal player loop
void    UnityBatchPlayerLoop();             // batch mode like player loop, without rendering (usable for background processing)
void    UnitySetPlayerFocus(int focused);   // send OnApplicationFocus() message to scripts
void    UnityLowMemory();
void    UnityPause(int pause);
int     UnityIsPaused();                    // 0 if player is running, 1 if paused
void    UnityWillPause();                   // send the message that app will pause
void    UnityWillResume();                  // send the message that app will resume
void    UnityInputProcess();
void    UnityDeliverUIEvents();             // unity processing impacting UI will be called in there
```

#### 3.3 Unity 应用启动流程

* main.mm 中指定启动 AppDelegate 为 UnityAppController:
 ```
 const char* AppControllerClassName = "UnityAppController";
 ```
 ```
 UIApplicationMain(argc, argv, nil, [NSString stringWithUTF8String: AppControllerClassName]);
 ```
* `UnityAppController.applicationdidFinishLaunchingWithOptions` 方法中创建 window 和 view, 关键代码：
```
    UnityInitApplicationNoGraphics([[[NSBundle mainBundle] bundlePath] UTF8String]);

    [self selectRenderingAPI];
    [UnityRenderingView InitializeForAPI: self.renderingAPI];

    _window         = [[UIWindow alloc] initWithFrame: [UIScreen mainScreen].bounds];
    _unityView      = [self createUnityView];

    [DisplayManager Initialize];
    _mainDisplay    = [DisplayManager Instance].mainDisplay;
    [_mainDisplay createWithWindow: _window andView: _unityView];

    [self createUI];
    [self preStartUnity];
```
`UnityInitApplicationNoGraphics`说明此处并未进行 Unity 图形相关的初始化，事实上这里只是创建了 splash 界面。`[self createUI]` 定义在 UnityAppController+ViewHandling 子模块中，具体实现大概是：
```
    _rootController = [self createRootViewController];
    
    [self willStartWithViewController: _rootController];

    [_window makeKeyAndVisible];
    [UIView setAnimationsEnabled: NO];

    ShowSplashScreen(_window);
```
Unity 项目实际打开的时机在 `UnityAppController.startUnity`:
```
- (void)startUnity:(UIApplication*)application
{
    NSAssert(_unityAppReady == NO, @"[UnityAppController startUnity:] called after Unity has been initialized");

    UnityInitApplicationGraphics();

    // we make sure that first level gets correct display list and orientation
    [[DisplayManager Instance] updateDisplayListCacheInUnity];

    UnityLoadApplication();
    Profiler_InitProfiler();

    [self showGameUI];
    [self createDisplayLink];

    UnitySetPlayerFocus(1);
}
```
原生层创建了 Unity 的 window和 view 并显示，至于显示Unity场景、UI这些工作，已经是 Unity Runtime 自己去做的事情了，到这里我们已经知道 Unity 启动时在原生端的大致流程。

![Unity-XCode工程架构图](https://upload-images.jianshu.io/upload_images/13097306-7fc3b1d07f86844a.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
#### 3.4 生命周期回调
我们知道 Unity 脚本的生命周期函数包括`Awake()`,`Start()`,`Update()`等，与切换前后台相关的主要是 `OnApplicationPause()`和`OnApplicationFocus()`,这两个方法应该是在触发前后台切换时由原生传递给 Unity Runtime的，我们先看看 iOS AppDelegate的生命周期：

![AppDelegate生命周期](https://upload-images.jianshu.io/upload_images/13097306-138c6361ca1905a6.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

看看工程中 UnityAppController 对应的生命周期方法中的关键代码:
```
// 切回前台
- (void)applicationDidBecomeActive:(UIApplication*)application
{
    ::printf("-> applicationDidBecomeActive()\n");

    [self removeSnapshotView];

    if (_unityAppReady)
    {
        if (UnityIsPaused() && _wasPausedExternal == false)
        {
            UnityWillResume();
            UnityPause(0);
        }
        if (_wasPausedExternal)
        {
            if (UnityIsFullScreenPlaying())
                TryResumeFullScreenVideo();
        }
        UnitySetPlayerFocus(1);
    }
    else if (!_startUnityScheduled)
    {
        _startUnityScheduled = true;
        [self performSelector: @selector(startUnity:) withObject: application afterDelay: 0];
    }

    _didResignActive = false;
}

// 切到后台
- (void)applicationWillResignActive:(UIApplication*)application
{
    ::printf("-> applicationWillResignActive()\n");

    if (_unityAppReady)
    {
        UnitySetPlayerFocus(0);

        _wasPausedExternal = UnityIsPaused();
        if (_wasPausedExternal == false)
        {
            // Pause Unity only if we don't need special background processing
            // otherwise batched player loop can be called to run user scripts.
            if (!UnityGetUseCustomAppBackgroundBehavior())
            {
                // Force player to do one more frame, so scripts get a chance to render custom screen for minimized app in task manager.
                // NB: UnityWillPause will schedule OnApplicationPause message, which will be sent normally inside repaint (unity player loop)
                // NB: We will actually pause after the loop (when calling UnityPause).
                UnityWillPause();
                [self repaint];
                UnityPause(1);

                // this is done on the next frame so that
                // in the case where unity is paused while going
                // into the background and an input is deactivated
                // we don't mess with the view hierarchy while taking
                // a view snapshot (case 760747).
                dispatch_async(dispatch_get_main_queue(), ^{
                    // if we are active again, we don't need to do this anymore
                    if (!_didResignActive)
                    {
                        return;
                    }

                    _snapshotView = [self createSnapshotView];
                    if (_snapshotView)
                        [_rootView addSubview: _snapshotView];
                });
            }
        }
    }

    _didResignActive = true;
}
```
可以看出，在 UnityAppController 切前后台的方法中调用了 `UnityPause()`,`UnitySetPlayerFocus()`,对应了 Unity 中的 `OnApplicationPause()`和 `UnityApplicationFocus()`

### 4. Cocos XCode工程分析
这里使用的是 Cocos Creator 引擎，为方便叙述，下面就直接使用 Cocos 来替代了。
#### 4.1 XCode 目录结构分析
同样的，新建一个空的cocos creator 项目并导出 XCode 工程，目录结构如下：
![cocos creator XCode 工程目录结构](https://upload-images.jianshu.io/upload_images/13097306-91b3fcaa1d3a0a4b.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

* cocos2d_libs.xcodeproj
这是一个子工程，有些项目会把它编译成静态库引入到项目，这个子工程包含cocos 原生的全部核心模块，根据工程的目录名字大概可以知道包含了哪些内容：
![cocos-2d子工程结构](https://upload-images.jianshu.io/upload_images/13097306-902239ccda69544c.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
其中的 platform/CCApplication.h 是应用的核心类。

* Classes 目录中只有一个 jsb_module_register.cpp，看起来是 cocos 引擎注册 js 模块用的
* Frameworks 库文件目录
* Products .app 文件存放地
* ios iOS平台相关代码，AppController 放在这里
* 
#### 4.2 cocos 应用启动流程
* `main.m` 中指定启动 AppDelegate 为 AppController
```
int main(int argc, char *argv[]) {
    
    NSAutoreleasePool * pool = [[NSAutoreleasePool alloc] init];
    int retVal = UIApplicationMain(argc, argv, nil, @"AppController");
    [pool release];
    return retVal;
}
```
* `AppController.applicationdidFinishLaunchingWithOptions` 方法中创建 window 和 view, 关键代码：
```
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    [[SDKWrapper getInstance] application:application didFinishLaunchingWithOptions:launchOptions];
    // Add the view controller's view to the window and display.
    float scale = [[UIScreen mainScreen] scale];
    CGRect bounds = [[UIScreen mainScreen] bounds];
    window = [[UIWindow alloc] initWithFrame: bounds];
    
    // cocos2d application instance
    app = new AppDelegate(bounds.size.width * scale, bounds.size.height * scale);
    app->setMultitouch(true);
    
    // Use RootViewController to manage CCEAGLView
    _viewController = [[RootViewController alloc]init];
#ifdef NSFoundationVersionNumber_iOS_7_0
    _viewController.automaticallyAdjustsScrollViewInsets = NO;
    _viewController.extendedLayoutIncludesOpaqueBars = NO;
    _viewController.edgesForExtendedLayout = UIRectEdgeAll;
#else
    _viewController.wantsFullScreenLayout = YES;
#endif
    // Set RootViewController to window
    if ( [[UIDevice currentDevice].systemVersion floatValue] < 6.0)
    {
        // warning: addSubView doesn't work on iOS6
        [window addSubview: _viewController.view];
    }
    else
    {
        // use this method on ios6
        [window setRootViewController:_viewController];
    }
    
    [window makeKeyAndVisible];
    
    [[UIApplication sharedApplication] setStatusBarHidden:YES];
    [[NSNotificationCenter defaultCenter] addObserver:self
        selector:@selector(statusBarOrientationChanged:)
        name:UIApplicationDidChangeStatusBarOrientationNotification object:nil];
    
    //run the cocos2d-x game scene
    app->start();
    
    return YES;
}
```
`app->start();` 开启了 cocos 游戏的主循环。 `app` 为 `cocos2d::Application` 实例：
```
class  AppDelegate : public cocos2d::Application
```
cocos2d::Application 定义在子工程 cocos2d_lib.xcodeproj 中，比较重要的方法声明：
```
    // This class is useful for internal usage.
    static Application* getInstance() { return _instance; }
    
    Application(const std::string& name, int width, int height);
    virtual ~Application();
    
    virtual bool applicationDidFinishLaunching();
    virtual void onPause();
    virtual void onResume();
    
    inline void* getView() const { return _view; }
    inline std::shared_ptr<Scheduler> getScheduler() const { return _scheduler; }
    inline RenderTexture* getRenderTexture() const { return _renderTexture; }
    
    void runOnMainThread();
    
    void start();
    void restart();
    void end();
```
* 以切后台为例，查看原生事件如何一步步透传到 cocos 的 js脚本

切后台时，原生端 `AppController.applicationWillResignActive` 被执行
```
- (void)applicationWillResignActive:(UIApplication *)application {
    /*
     Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
     Use this method to pause ongoing tasks, disable timers, and throttle down OpenGL ES frame rates. Games should use this method to pause the game.
     */
    app->onPause();
    [[SDKWrapper getInstance] applicationWillResignActive:application];
}
```

继承自`cocos2d::Application` 的 `AppDelegate`对象 app 调用 `EventDispatcher` 派发切后台事件
```
void AppDelegate::onPause()
{
    EventDispatcher::dispatchOnPauseEvent();
}
```
分别对原生和 js 层派发事件
```
void EventDispatcher::dispatchOnPauseEvent()
{
    // dispatch to Native
    CustomEvent event;
    event.name = EVENT_ON_PAUSE;
    EventDispatcher::dispatchCustomEvent(event);

    // dispatch to JavaScript
    dispatchEnterBackgroundOrForegroundEvent("onPause");
}
```
看看针对 js 层派发事件的实现
```
static void dispatchEnterBackgroundOrForegroundEvent(const char* funcName)
{
    if (!se::ScriptEngine::getInstance()->isValid())
        return;

    se::AutoHandleScope scope;
    assert(_inited);

    se::Value func;
    __jsbObj->getProperty(funcName, &func);
    if (func.isObject() && func.toObject()->isFunction())
    {
        func.toObject()->call(se::EmptyValueArray, nullptr);
    }
}
```

### 5. 工程合并
项目主体是 Cocos Creator，因此需要将 Unity 生成的 XCode 工程整合到 Cocos Creator 生成的主题工程。整体想法是项目启动时初始化unituyController，在需要跳转 unity 时，显示 unityWindow。
#### 5.1 相关目录合并
在 Cocos-Xcode 工程中新建 Group，名为 Unity，会在 Cocos-XCode 工程目录下生成 Unity 目录，打开 Unity 工程，导出到 Cocos-Xcode 的 Unity 目录下。
使用创建目录方式(Create Groups)把目录 Classes/Libraries 和文件 MapFileParser.sh 导入到工程中，使用创建引用方式(Create Folder References) 把 Data 目录导入项目中，添加完成后的目录如下：
![导入 Unity 后的目录结构](https://upload-images.jianshu.io/upload_images/13097306-9b9e6961dac3fad6.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
* 删除 il2cpp 目录
![删除il2cpp目录](https://upload-images.jianshu.io/upload_images/13097306-15059b4778159585.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

#### 5.2 framework 文件
libil2cpp.a 和 libiPhone-lib.a 已经自动添加，需要手动添加libiconv2.tbd，对比 Unity 项目的 XCode 工程，对比添加。

#### 5.3 合并 main.mm 文件
直接使用 Unity/Classes/main.mm 文件覆盖了 ios/main.m 文件（因为 .m 和 .mm 文件的差别，这里不要只覆盖内容，需要确保覆盖文件），然后把启动 Controller 改成 AppController 即可
![替换Controller](https://upload-images.jianshu.io/upload_images/13097306-68856c61ce5ca254.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

#### 5.4 合并 Prefix.pch 文件
查看两个文件可以看到，ios/Prefix.pch 的内容被完整包含在 Unity/Classes/Prefix.pch 中，直接用 Unity/Classes/Prefix.pch 替换 iOS/Prefix.pch 就可以了

#### 5.4 修改 BuildPhase
增加 MapFileParser.sh 到 RunScript中
![RunScript](https://upload-images.jianshu.io/upload_images/13097306-aee181b568e1cbee.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
#### 5.5 修改 BuildSettings
* Other Linker Flags
![Other Linker Flags](https://upload-images.jianshu.io/upload_images/13097306-57bfe9b72fac657f.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
* 添加 Header Search Paths
![Header Search Path](https://upload-images.jianshu.io/upload_images/13097306-7477f2a9a0a61ee2.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
* 添加 Library Search Paths
![Libraries Search Path](https://upload-images.jianshu.io/upload_images/13097306-71a179eb895b6fd9.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
* 修改 Custom Complier Flags
![Custom Compiler Flag](https://upload-images.jianshu.io/upload_images/13097306-e5561c36b52ccca1.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
* 添加 User Defined 项
* ![User Defined](https://upload-images.jianshu.io/upload_images/13097306-b9307103c31ed55e.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

#### 5.6 修改编译错误
基本就是因为 Hearder Search Path 修改带来的头文件引用修改，例如：
![代码修改](https://upload-images.jianshu.io/upload_images/13097306-d63b0dcfbe853dc4.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
我这里涉及到的修改有

SplashScreen.mm

UnityInterface.h

DynamicLibEngineAPI.mm

到此时，编译运行尝试一下，如果上面的步骤都没有弄错，应该就可以把合并后的工程跑起来了。如果还有编译错误，可以针对性的进行修改。只不过运行以后还是看到的 cocos 界面，因为这里使用 AppController 启动。

#### 5.7 部分文件编译属性修改
DisplayManager.mm 需要添加 -fobjc-arc, 否则会闪退，猜测是内存管理方式问题不兼容。

#### 5.8 自动化构建脚本

### 4. 接口互调和数据互传
####4.1 Cocos 中如何打开 Unity
以 Cocos 工程为主工程，main.mm 中以 AppController 来启动，那么在需要打开 Unity 的时候启动 UnityController 就可以了
* 初始化 unityController

* 打开 unity 窗口

* 暂停 unity 窗口，回到 cocos 窗口

* unity 退出

### 5. 关键性能数据对比

### 6. 坑和填坑

参考文献：
* [Unity官方:Unity XCode 项目的结构](https://docs.unity3d.com/cn/2018.4/Manual/StructureOfXcodeProject.html)
* [AppDelegate生命周期](https://www.jianshu.com/p/8465f8b60b71)
