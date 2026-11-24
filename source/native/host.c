/* Kumiko Studio — MIT License, Copyright (c) 2026.
 * A native AppKit/WKWebView host. Objective-C dispatch is resolved at runtime
 * so the same C source can be built with Xcode, or cross-compiled without an
 * Apple SDK. No external runtime, browser, server, or interpreter is needed.
 * Use fixed function signatures for every objc_msgSend call (ARM64 ABI).
 */
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef void *Obj;
typedef void *Sel;
typedef unsigned long UInt;
typedef signed char Bool;
typedef struct { double x, y; } Point;
typedef struct { double width, height; } Size;
typedef struct { Point origin; Size size; } Rect;
static void *send;
static Obj (*getClass)(const char *);
static Sel (*selector)(const char *);
static Obj (*allocateClass)(Obj, const char *, size_t);
static void (*registerClass)(Obj);
static Bool (*addMethod)(Obj, Sel, void *, const char *);
static Obj (*getProtocol)(const char *);
static Bool (*addProtocol)(Obj, Obj);
static Obj app, window, web, delegate, resources;
static char *pendingPath;
static int pageReady;

#define SEL(s) selector(s)
#define C(s) getClass(s)
#define O0(o,s) ((Obj(*)(Obj,Sel))send)(o,SEL(s))
#define O1(o,s,a) ((Obj(*)(Obj,Sel,Obj))send)(o,SEL(s),(Obj)(a))
#define O2(o,s,a,b) ((Obj(*)(Obj,Sel,Obj,Obj))send)(o,SEL(s),(Obj)(a),(Obj)(b))
#define O3(o,s,a,b,c) ((Obj(*)(Obj,Sel,Obj,Obj,Obj))send)(o,SEL(s),(Obj)(a),(Obj)(b),(Obj)(c))
#define V0(o,s) ((void(*)(Obj,Sel))send)(o,SEL(s))
#define V1(o,s,a) ((void(*)(Obj,Sel,Obj))send)(o,SEL(s),(Obj)(a))
#define VB(o,s,a) ((void(*)(Obj,Sel,Bool))send)(o,SEL(s),(Bool)(a))
#define VI(o,s,a) ((void(*)(Obj,Sel,UInt))send)(o,SEL(s),(UInt)(a))
#define U0(o,s) ((UInt(*)(Obj,Sel))send)(o,SEL(s))

static Obj ns(const char *s) { return O1(C("NSString"),"stringWithUTF8String:",s ? s : ""); }
static const char *utf(Obj s) { return s ? (const char *)O0(s,"UTF8String") : ""; }
static Obj get(Obj d, const char *key) { return O1(d,"objectForKey:",ns(key)); }
static Obj num(Bool b) { return ((Obj(*)(Obj,Sel,Bool))send)(C("NSNumber"),SEL("numberWithBool:"),b); }
static Obj dict(Obj *values, const char **names, UInt count) {
    Obj keys[16];
    if(count > 16) return 0;
    for(UInt i=0; i<count; ++i) keys[i]=ns(names[i]);
    return ((Obj(*)(Obj,Sel,Obj*,Obj*,UInt))send)(C("NSDictionary"),SEL("dictionaryWithObjects:forKeys:count:"),values,keys,count);
}
static Obj arrayOne(Obj value) { return O1(C("NSArray"),"arrayWithObject:",value); }
static void js(Obj code) { O2(web,"evaluateJavaScript:completionHandler:",code,0); }
static Obj json(Obj value) {
    Obj err=0;
    Obj data=((Obj(*)(Obj,Sel,Obj,UInt,Obj*))send)(C("NSJSONSerialization"),SEL("dataWithJSONObject:options:error:"),value,0,&err);
    if(!data) return ns("null");
    Obj text=((Obj(*)(Obj,Sel,Obj,UInt))send)(O0(C("NSString"),"alloc"),SEL("initWithData:encoding:"),data,4);
    return O0(text,"autorelease");
}
static void reply(Obj request, Bool ok, Obj value) {
    Obj vals[]={get(request,"id"),num(ok),value ? value : O0(C("NSNull"),"null")};
    const char *names[]={"id","ok","value"};
    Obj text=O1(ns("window.nativeReply && window.nativeReply("),"stringByAppendingString:",json(dict(vals,names,3)));
    js(O1(text,"stringByAppendingString:",ns(");")));
}
static Obj cancelled(void) {
    Obj v[]={num(1)}; const char *n[]={"cancelled"}; return dict(v,n,1);
}
static Obj readImage(Obj url, Obj *error) {
    Obj attrs=((Obj(*)(Obj,Sel,Obj,Obj*))send)(O0(C("NSFileManager"),"defaultManager"),SEL("attributesOfItemAtPath:error:"),O0(url,"path"),error);
    if(!attrs || U0(get(attrs,"NSFileSize"),"unsignedLongLongValue")>80000000){ *error=ns("Choose a readable image smaller than 80 MB."); return 0; }
    Obj image=O1(O0(C("NSImage"),"alloc"),"initWithContentsOfURL:",url);
    if(!image){ *error=ns("macOS could not decode this image. Try a PNG or JPEG."); return 0; }
    Obj tiff=O0(image,"TIFFRepresentation");
    Obj bitmap=O1(C("NSBitmapImageRep"),"imageRepWithData:",tiff);
    Obj properties=O0(C("NSDictionary"),"dictionary");
    Obj png=((Obj(*)(Obj,Sel,UInt,Obj))send)(bitmap,SEL("representationUsingType:properties:"),4,properties);
    V0(image,"release");
    if(!png){ *error=ns("Could not convert this image to PNG."); return 0; }
    Obj b64=((Obj(*)(Obj,Sel,UInt))send)(png,SEL("base64EncodedStringWithOptions:"),0);
    Obj vals[]={O1(ns("data:image/png;base64,"),"stringByAppendingString:",b64),O0(url,"lastPathComponent")};
    const char *names[]={"data","name"}; return dict(vals,names,2);
}
static Obj readProject(Obj url, Obj *error) {
    Obj data=O1(C("NSData"),"dataWithContentsOfURL:",url);
    if(!data || U0(data,"length")>80000000){ *error=ns("Cannot read the project, or it exceeds the 80 MB limit."); return 0; }
    Obj text=((Obj(*)(Obj,Sel,Obj,UInt))send)(O0(C("NSString"),"alloc"),SEL("initWithData:encoding:"),data,4);
    if(!text){ *error=ns("The project must be a UTF-8 JSON file."); return 0; }
    O0(text,"autorelease");
    Obj vals[]={text,O0(url,"lastPathComponent")}; const char *names[]={"data","name"}; return dict(vals,names,2);
}
static void deliverPath(const char *path) {
    Obj url=O1(C("NSURL"),"fileURLWithPath:",ns(path));
    const char *ext=utf(O0(url,"pathExtension"));
    Bool project=!strcmp(ext,"json") || !strcmp(ext,"kumiko");
    Obj err=0, data=project ? readProject(url,&err) : readImage(url,&err);
    Obj vals[]={ns(project ? "project" : "image"),data ? data : O0(C("NSNull"),"null"),err ? err : O0(C("NSNull"),"null")};
    const char *names[]={"kind","file","error"};
    Obj code=O1(ns("window.nativeFile && window.nativeFile("),"stringByAppendingString:",json(dict(vals,names,3)));
    js(O1(code,"stringByAppendingString:",ns(");")));
}
static void onMessage(Obj self, Sel cmd, Obj controller, Obj message) {
    (void)self; (void)cmd; (void)controller;
    Obj pool=O0(O0(C("NSAutoreleasePool"),"alloc"),"init");
    Obj request=O0(message,"body"), args=get(request,"args");
    const char *type=utf(get(request,"type"));
    if(!strcmp(type,"ready")) {
        pageReady=1; reply(request,1,ns("Kumiko Studio"));
        if(pendingPath){ deliverPath(pendingPath); free(pendingPath); pendingPath=0; }
    } else if(!strcmp(type,"openImage") || !strcmp(type,"openProject")) {
        Bool project=!strcmp(type,"openProject");
        Obj panel=O0(C("NSOpenPanel"),"openPanel");
        VB(panel,"setCanChooseDirectories:",0); VB(panel,"setCanChooseFiles:",1); VB(panel,"setAllowsMultipleSelection:",0);
        V1(panel,"setTitle:",ns(project ? "Open Kumiko project" : "Choose an image"));
        if(project) V1(panel,"setAllowedFileTypes:",arrayOne(ns("json")));
        if(U0(panel,"runModal")!=1) reply(request,1,cancelled());
        else {
            Obj err=0, url=O0(panel,"URL");
            Obj result=project ? readProject(url,&err) : readImage(url,&err);
            reply(request,result!=0,result ? result : err);
        }
    } else if(!strcmp(type,"saveFile")) {
        const char *format=utf(get(args,"format"));
        if(strcmp(format,"zip") && strcmp(format,"json")){ reply(request,0,ns("Unsupported export format.")); }
        else {
            Obj data=((Obj(*)(Obj,Sel,Obj,UInt))send)(O0(C("NSData"),"alloc"),SEL("initWithBase64EncodedString:options:"),get(args,"base64"),0);
            if(!data || U0(data,"length")>250000000) reply(request,0,ns("Export is invalid or exceeds 250 MB. Use larger cells or smaller panels."));
            else {
                Obj panel=O0(C("NSSavePanel"),"savePanel");
                V1(panel,"setTitle:",ns("Save Kumiko Studio file"));
                V1(panel,"setAllowedFileTypes:",arrayOne(ns(format)));
                V1(panel,"setNameFieldStringValue:",O0(get(args,"name"),"lastPathComponent"));
                VB(panel,"setCanCreateDirectories:",1);
                if(U0(panel,"runModal")!=1) reply(request,1,cancelled());
                else {
                    Obj err=0, url=O0(panel,"URL");
                    Bool ok=((Bool(*)(Obj,Sel,Obj,UInt,Obj*))send)(data,SEL("writeToURL:options:error:"),url,1,&err);
                    reply(request,ok,ok ? O0(url,"path") : (err ? O0(err,"localizedDescription") : ns("Could not write the file.")));
                }
            }
            if(data) V0(data,"release");
        }
    } else reply(request,0,ns("Unknown native action."));
    V0(pool,"drain");
}
static Bool closeApp(Obj self, Sel cmd, Obj sender) { (void)self;(void)cmd;(void)sender; return 1; }
static Bool openFile(Obj self, Sel cmd, Obj sender, Obj filename) {
    (void)self;(void)cmd;(void)sender;
    if(pageReady) deliverPath(utf(filename));
    else { free(pendingPath); pendingPath=strdup(utf(filename)); }
    return 1;
}
static void nativeAction(const char *name) {
    char code[160]; snprintf(code,sizeof(code),"window.nativeAction && window.nativeAction('%s');",name); js(ns(code));
}
static void doOpen(Obj a,Sel b,Obj c){(void)a;(void)b;(void)c;nativeAction("openImage");}
static void doProject(Obj a,Sel b,Obj c){(void)a;(void)b;(void)c;nativeAction("openProject");}
static void doSave(Obj a,Sel b,Obj c){(void)a;(void)b;(void)c;nativeAction("saveProject");}
static void doExport(Obj a,Sel b,Obj c){(void)a;(void)b;(void)c;nativeAction("export");}
static void doHelp(Obj a,Sel b,Obj c){(void)a;(void)b;(void)c;nativeAction("help");}
static void doAbout(Obj a,Sel b,Obj c){(void)a;(void)b;(void)c; O1(app,"orderFrontStandardAboutPanel:",0);}
static Obj menuItem(const char *title,const char *action,const char *key,Obj target,UInt modifiers) {
    Obj item=O3(O0(C("NSMenuItem"),"alloc"),"initWithTitle:action:keyEquivalent:",ns(title),action ? SEL(action) : 0,ns(key));
    if(target) V1(item,"setTarget:",target);
    if(modifiers) VI(item,"setKeyEquivalentModifierMask:",modifiers);
    return item;
}
static Obj makeMenu(Obj bar,const char *title) {
    Obj root=menuItem(title,0,"",0,0); V1(bar,"addItem:",root);
    Obj menu=O1(O0(C("NSMenu"),"alloc"),"initWithTitle:",ns(title)); V1(root,"setSubmenu:",menu); return menu;
}
static void setupMenus(void) {
    UInt command=1UL<<20, shift=1UL<<17;
    Obj bar=O1(O0(C("NSMenu"),"alloc"),"initWithTitle:",ns(""));
    Obj m=makeMenu(bar,"Kumiko Studio");
    V1(m,"addItem:",menuItem("About Kumiko Studio","about:","",delegate,0));
    V1(m,"addItem:",O0(C("NSMenuItem"),"separatorItem"));
    V1(m,"addItem:",menuItem("Hide Kumiko Studio","hide:","h",app,command));
    V1(m,"addItem:",menuItem("Quit Kumiko Studio","terminate:","q",app,command));
    m=makeMenu(bar,"File");
    V1(m,"addItem:",menuItem("Open Image…","openImage:","o",delegate,command));
    V1(m,"addItem:",menuItem("Open Project…","openProject:","o",delegate,command|shift));
    V1(m,"addItem:",menuItem("Save Project…","saveProject:","s",delegate,command));
    V1(m,"addItem:",menuItem("Export STL ZIP…","exportSTLs:","e",delegate,command));
    m=makeMenu(bar,"Edit");
    const char *labels[]={"Undo","Redo","Cut","Copy","Paste","Select All"};
    const char *acts[]={"undo:","redo:","cut:","copy:","paste:","selectAll:"};
    const char *keys[]={"z","z","x","c","v","a"};
    for(int i=0;i<6;i++) V1(m,"addItem:",menuItem(labels[i],acts[i],keys[i],0,command|(i==1?shift:0)));
    m=makeMenu(bar,"Window");
    V1(m,"addItem:",menuItem("Minimize","performMiniaturize:","m",0,command));
    V1(app,"setWindowsMenu:",m);
    m=makeMenu(bar,"Help"); V1(m,"addItem:",menuItem("Kumiko Studio Guide","help:","?",delegate,command));
    V1(app,"setHelpMenu:",m); V1(app,"setMainMenu:",bar);
}
static int runtime(void) {
    void *objc=dlopen("/usr/lib/libobjc.A.dylib",RTLD_NOW|RTLD_GLOBAL);
    if(!objc || !dlopen("/System/Library/Frameworks/AppKit.framework/AppKit",RTLD_NOW|RTLD_GLOBAL)
      || !dlopen("/System/Library/Frameworks/WebKit.framework/WebKit",RTLD_NOW|RTLD_GLOBAL)) return 0;
    send=dlsym(objc,"objc_msgSend");
    getClass=dlsym(objc,"objc_getClass"); selector=dlsym(objc,"sel_registerName");
    allocateClass=dlsym(objc,"objc_allocateClassPair"); registerClass=dlsym(objc,"objc_registerClassPair");
    addMethod=dlsym(objc,"class_addMethod"); getProtocol=dlsym(objc,"objc_getProtocol"); addProtocol=dlsym(objc,"class_addProtocol");
    return send && getClass && selector && allocateClass && registerClass && addMethod;
}
int main(int argc,char **argv) {
    if(!runtime()){ fprintf(stderr,"Cannot load macOS AppKit/WebKit: %s\n",dlerror()); return 2; }
    Obj pool=O0(O0(C("NSAutoreleasePool"),"alloc"),"init");
    resources=O0(O0(C("NSBundle"),"mainBundle"),"resourcePath"); V0(resources,"retain");
    app=O0(C("NSApplication"),"sharedApplication"); VI(app,"setActivationPolicy:",0);
    Obj cls=allocateClass(C("NSObject"),"KumikoStudioDelegate",0);
    addMethod(cls,SEL("userContentController:didReceiveScriptMessage:"),(void*)onMessage,"v@:@@");
    addMethod(cls,SEL("applicationShouldTerminateAfterLastWindowClosed:"),(void*)closeApp,"c@:@");
    addMethod(cls,SEL("application:openFile:"),(void*)openFile,"c@:@@");
    addMethod(cls,SEL("openImage:"),(void*)doOpen,"v@:@");
    addMethod(cls,SEL("openProject:"),(void*)doProject,"v@:@");
    addMethod(cls,SEL("saveProject:"),(void*)doSave,"v@:@");
    addMethod(cls,SEL("exportSTLs:"),(void*)doExport,"v@:@");
    addMethod(cls,SEL("help:"),(void*)doHelp,"v@:@");
    addMethod(cls,SEL("about:"),(void*)doAbout,"v@:@");
    Obj protocol=getProtocol("WKScriptMessageHandler"); if(protocol) addProtocol(cls,protocol);
    protocol=getProtocol("NSApplicationDelegate"); if(protocol) addProtocol(cls,protocol);
    registerClass(cls); delegate=O0(O0(cls,"alloc"),"init"); V1(app,"setDelegate:",delegate);
    setupMenus();
    Rect rect={{0,0},{1240,820}};
    window=((Obj(*)(Obj,Sel,Rect,UInt,UInt,Bool))send)(O0(C("NSWindow"),"alloc"),SEL("initWithContentRect:styleMask:backing:defer:"),rect,15,2,0);
    V1(window,"setTitle:",ns("Kumiko Studio"));
    Size min={960,650}; ((void(*)(Obj,Sel,Size))send)(window,SEL("setMinSize:"),min);
    VB(window,"setReleasedWhenClosed:",0);
    Obj config=O0(O0(C("WKWebViewConfiguration"),"alloc"),"init");
    Obj controller=O0(config,"userContentController"); O2(controller,"addScriptMessageHandler:name:",delegate,ns("kumiko"));
    web=((Obj(*)(Obj,Sel,Rect,Obj))send)(O0(C("WKWebView"),"alloc"),SEL("initWithFrame:configuration:"),rect,config);
    VI(web,"setAutoresizingMask:",18); V1(window,"setContentView:",web);
    Obj file=O1(resources,"stringByAppendingPathComponent:",ns("web/index.html"));
    Obj readRoot=O1(C("NSURL"),"fileURLWithPath:",resources);
    O2(web,"loadFileURL:allowingReadAccessToURL:",O1(C("NSURL"),"fileURLWithPath:",file),readRoot);
    if(argc>1 && argv[1][0]!="-"[0]) pendingPath=strdup(argv[1]);
    V0(window,"center"); O1(window,"makeKeyAndOrderFront:",0); VB(app,"activateIgnoringOtherApps:",1);
    V0(app,"run"); V0(pool,"drain"); return 0;
}
