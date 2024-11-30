#!/usr/bin/env node
import chalk from 'chalk';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import fs, { existsSync, readFile as readFile$1 } from 'fs';
import { rollup } from 'rollup';
import json from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { performance as performance$1 } from 'perf_hooks';

const Logger = {
    Info: (...LogMessage) => {
        console.log(chalk.magenta.bold("[+]"), ...LogMessage);
    },
    Warn: (...LogMessage) => {
        console.log(chalk.yellow.bold("[*]"), ...LogMessage);
    },
    Error: (...LogMessage) => {
        console.log(chalk.red.bold("[-]"), ...LogMessage);
    },
    Tree: (strTitle, LogObject) => {
        console.log(chalk.magenta.bold("[┬]"), strTitle);
        const isLocalPath = (strTestPath) => {
            // Regular expression to match common file path patterns
            const filePathRegex = /^(\/|\.\/|\.\.\/|\w:\/)?([\w-.]+\/)*[\w-.]+\.\w+$/;
            return filePathRegex.test(strTestPath);
        };
        const entries = Object.entries(LogObject);
        const totalEntries = entries.length;
        for (const [index, [key, value]] of entries.entries()) {
            const connector = index === totalEntries - 1 ? "└" : "├";
            let color = chalk.white;
            switch (typeof value) {
                case typeof String(): {
                    color = isLocalPath(value) ? chalk.blueBright : chalk.white;
                    break;
                }
                case typeof Boolean():
                    color = chalk.green;
                    break;
                case typeof Number():
                    color = chalk.yellow;
                    break;
            }
            console.log(chalk.magenta.bold(` ${connector}──${key}:`), color(value));
        }
    }
};

/***
 * @brief print the parameter list to the stdout
 */
const PrintParamHelp = () => {
    console.log("millennium-ttc parameter list:" +
        "\n\t" + chalk.magenta("--help") + ": display parameter list" +
        "\n\t" + chalk.bold.red("--build") + ": " + chalk.bold.red("(required)") + ": build type [dev, prod] (prod minifies code)" +
        "\n\t" + chalk.magenta("--target") + ": path to plugin, default to cwd");
};
var BuildType;
(function (BuildType) {
    BuildType[BuildType["DevBuild"] = 0] = "DevBuild";
    BuildType[BuildType["ProdBuild"] = 1] = "ProdBuild";
})(BuildType || (BuildType = {}));
const ValidateParameters = (args) => {
    let typeProp = BuildType.DevBuild, targetProp = process.cwd();
    if (args.includes("--help")) {
        PrintParamHelp();
        process.exit();
    }
    // startup args are invalid
    if (!args.includes("--build")) {
        Logger.Error("Received invalid arguments...");
        PrintParamHelp();
        process.exit();
    }
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--build") {
            const BuildMode = args[i + 1];
            switch (BuildMode) {
                case "dev":
                    typeProp = BuildType.DevBuild;
                    break;
                case "prod":
                    typeProp = BuildType.ProdBuild;
                    break;
                default: {
                    Logger.Error('--build parameter must be preceded by build type [dev, prod]');
                    process.exit();
                }
            }
        }
        if (args[i] == "--target") {
            if (args[i + 1] === undefined) {
                Logger.Error('--target parameter must be preceded by system path');
                process.exit();
            }
            targetProp = args[i + 1];
        }
    }
    return {
        type: typeProp,
        targetPlugin: targetProp
    };
};

const CheckForUpdates = async () => {
    return new Promise(async (resolve) => {
        const packageJsonPath = path.resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
        fetch("https://registry.npmjs.org/millennium-lib").then(response => response.json()).then(json => {
            if (json?.["dist-tags"]?.latest != packageJson.version) {
                Logger.Tree(`millennium-lib@${packageJson.version} requires update to ${json?.["dist-tags"]?.latest}`, {
                    cmd: "run `npm i millennium-lib` to get latest updates!"
                });
                resolve(true);
            }
            else {
                Logger.Info(`millennium-lib@${packageJson.version} is up-to-date!`);
                resolve(false);
            }
        });
    });
};

const ValidatePlugin = (target) => {
    return new Promise((resolve, reject) => {
        if (!existsSync(target)) {
            console.error(chalk.red.bold(`\n[-] --target [${target}] `) + chalk.red("is not a valid system path"));
            reject();
            return;
        }
        const pluginModule = path.join(target, "plugin.json");
        if (!existsSync(pluginModule)) {
            console.error(chalk.red.bold(`\n[-] --target [${target}] `) + chalk.red("is not a valid plugin (missing plugin.json)"));
            reject();
            return;
        }
        readFile$1(pluginModule, 'utf8', (err, data) => {
            if (err) {
                console.error(chalk.red.bold(`\n[-] couldn't read plugin.json from [${pluginModule}]`));
                reject();
                return;
            }
            try {
                if (!("name" in JSON.parse(data))) {
                    console.error(chalk.red.bold(`\n[-] target plugin doesn't contain "name" in plugin.json [${pluginModule}]`));
                    reject();
                }
                else {
                    resolve(JSON.parse(data));
                }
            }
            catch (parseError) {
                console.error(chalk.red.bold(`\n[-] couldn't parse JSON in plugin.json from [${pluginModule}]`));
                reject();
            }
        });
    });
};

const WrappedCallServerMethod = "const __call_server_method__ = (methodName, kwargs) => Millennium.callServerMethod(pluginName, methodName, kwargs)";
const WrappedCallable = "const __wrapped_callable__ = (route) => MILLENNIUM_API.callable(__call_server_method__, route)";
/**
 * @description Append the active plugin to the global plugin
 * list and notify that the frontend Loaded.
 */
function ExecutePluginModule() {
    // Assign the plugin on plugin list. 
    Object.assign(window.PLUGIN_LIST[pluginName], millennium_main);
    // Run the rolled up plugins default exported function 
    millennium_main["default"]();
    MILLENNIUM_BACKEND_IPC.postMessage(1, { pluginName: pluginName });
}
/**
 * @description Append the active plugin to the global plugin
 * list and notify that the frontend Loaded.
 */
function ExecuteWebkitModule() {
    // Assign the plugin on plugin list. 
    Object.assign(window.PLUGIN_LIST[pluginName], millennium_main);
    // Run the rolled up plugins default exported function 
    millennium_main["default"]();
}
/**
 * @description Simple bootstrap function that initializes PLUGIN_LIST
 * for current plugin given that is doesnt exist.
 */
function InitializePlugins() {
    /**
     * This function is called n times depending on n plugin count,
     * Create the plugin list if it wasn't already created
     */
    !window.PLUGIN_LIST && (window.PLUGIN_LIST = {});
    // initialize a container for the plugin
    if (!window.PLUGIN_LIST[pluginName]) {
        window.PLUGIN_LIST[pluginName] = {};
    }
}
function InsertMillennium(props) {
    const ContructFunctions = (parts) => { return parts.join('\n'); };
    const generateBundle = (_, bundle) => {
        for (const fileName in bundle) {
            if (bundle[fileName].type != 'chunk') {
                continue;
            }
            Logger.Info("Injecting Millennium shims into module... " + chalk.green.bold("okay"));
            bundle[fileName].code = ContructFunctions([
                `const pluginName = "${props.strPluginInternalName}";`,
                // insert the bootstrap function and call it
                InitializePlugins.toString(), InitializePlugins.name + "()",
                WrappedCallServerMethod,
                WrappedCallable,
                bundle[fileName].code,
                ExecutePluginModule.toString(), ExecutePluginModule.name + "()"
            ]);
        }
    };
    return {
        name: 'add-plugin-main', generateBundle
    };
}
function InsertWebkitMillennium(props) {
    const ContructFunctions = (parts) => { return parts.join('\n'); };
    const generateBundle = (_, bundle) => {
        for (const fileName in bundle) {
            if (bundle[fileName].type != 'chunk') {
                continue;
            }
            Logger.Info("Injecting Millennium shims into webkit module... " + chalk.green.bold("okay"));
            bundle[fileName].code = ContructFunctions([
                // define the plugin name at the top of the bundle, so it can be used in wrapped functions
                `const pluginName = "${props.strPluginInternalName}";`,
                // insert the bootstrap function and call it
                InitializePlugins.toString(), InitializePlugins.name + "()",
                // TODO
                WrappedCallServerMethod, WrappedCallable, bundle[fileName].code,
                ExecuteWebkitModule.toString(), ExecuteWebkitModule.name + "()"
            ]);
        }
    };
    return {
        name: 'add-plugin-main', generateBundle
    };
}
function GetPluginComponents(props) {
    const pluginList = [
        /**
         * @brief resolve millennium, edit the exported bundle to work with millennium
         */
        InsertMillennium(props),
        typescript(), nodeResolve(), commonjs(), json(),
        replace({
            preventAssignment: true,
            'process.env.NODE_ENV': JSON.stringify('production'),
            // replace callServerMethod with wrapped replacement function. 
            'Millennium.callServerMethod': `__call_server_method__`,
            'client.callable': `__wrapped_callable__`,
            delimiters: ['', ''],
            'client.pluginSelf': 'window.PLUGIN_LIST[pluginName]',
            'client.Millennium.exposeObj(': 'client.Millennium.exposeObj(exports, '
        }),
    ];
    if (props.bTersePlugin) {
        pluginList.push(terser());
    }
    return pluginList;
}
function GetWebkitPluginComponents(props) {
    const pluginList = [
        InsertWebkitMillennium(props), typescript(), nodeResolve(), commonjs(), json(),
        replace({
            preventAssignment: true,
            // replace callServerMethod with wrapped replacement function. 
            'Millennium.callServerMethod': `__call_server_method__`,
            'client.callable': `__wrapped_callable__`,
            delimiters: ['', ''],
        }),
    ];
    if (props.bTersePlugin) {
        pluginList.push(terser());
    }
    return pluginList;
}
const GetFrontEndDirectory = () => {
    const pluginJsonPath = './plugin.json';
    try {
        const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
        const frontendDirectory = pluginJson?.frontend;
        return frontendDirectory ? frontendDirectory : "frontend";
    }
    catch (error) {
        return "frontend";
    }
};
const TranspilerPluginComponent = async (props) => {
    const frontendRollupConfig = {
        input: `./${GetFrontEndDirectory()}/index.tsx`,
        plugins: GetPluginComponents(props),
        context: 'window',
        external: ['react', 'react-dom', '@steambrew/client'],
        output: {
            name: "millennium_main",
            file: ".millennium/Dist/index.js",
            globals: {
                react: "window.SP_REACT",
                "react-dom": "window.SP_REACTDOM",
                "@steambrew/client": "window.MILLENNIUM_API"
            },
            exports: 'named',
            format: 'iife'
        }
    };
    const webkitRollupConfig = {
        input: `./webkit/index.ts`,
        plugins: GetWebkitPluginComponents(props),
        context: 'window',
        external: ['@steambrew/client'],
        output: {
            name: "millennium_main",
            file: ".millennium/Dist/webkit.js",
            exports: 'named',
            format: 'iife',
            globals: {
                "@steambrew/client": "window.MILLENNIUM_API"
            },
        }
    };
    Logger.Info("Starting build; this may take a few moments...");
    // Load the Rollup configuration file
    try {
        const bundle = await rollup(frontendRollupConfig);
        const outputOptions = frontendRollupConfig.output;
        await bundle.write(outputOptions);
        // check if the webkit file exists
        if (fs.existsSync(`./webkit/index.ts`)) {
            Logger.Info("Compiling webkit module...");
            const bundle1 = await rollup(webkitRollupConfig);
            const outputOptions1 = webkitRollupConfig.output;
            await bundle1.write(outputOptions1);
        }
        Logger.Info('Build succeeded!', Number((performance.now() - global.PerfStartTime).toFixed(3)), 'ms elapsed.');
    }
    catch (exception) {
        Logger.Error('Build failed!', exception);
    }
};

/**
 * this component serves as:
 * - typescript transpiler
 * - rollup configurator
 */
const CheckModuleUpdates = async () => {
    return await CheckForUpdates();
};
const StartCompilerModule = () => {
    const parameters = ValidateParameters(process.argv.slice(2));
    const bTersePlugin = parameters.type == BuildType.ProdBuild;
    Logger.Tree("Transpiler config: ", {
        target: parameters.targetPlugin,
        build: BuildType[parameters.type],
        minify: bTersePlugin
    });
    ValidatePlugin(parameters.targetPlugin).then((json) => {
        const props = {
            bTersePlugin: bTersePlugin,
            strPluginInternalName: json?.name
        };
        TranspilerPluginComponent(props);
    })
        /**
         * plugin is invalid, we close the proccess as it has already been handled
         */
        .catch(() => {
        process.exit();
    });
};
const Initialize = () => {
    global.PerfStartTime = performance$1.now();
    CheckModuleUpdates().then((needsUpdate) => {
        needsUpdate ? process.exit() : StartCompilerModule();
    });
};
Initialize();