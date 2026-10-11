import SwiftRs
import Tauri
import UIKit
import WebKit

class TabArg: Decodable {
    let title: String
    let symbol: String
}

class TabsArgs: Decodable {
    let tabs: [TabArg]
    let selected: Int?
}

class IndexArgs: Decodable {
    let index: Int
}

class VisibilityArgs: Decodable {
    let visible: Bool
}

class NativeGlassPlugin: Plugin, UITabBarDelegate {
    private weak var webView: WKWebView?
    private var tabBar: UITabBar?

    @objc public override func load(webview: WKWebView) {
        webView = webview
    }

    private func materialName() -> String {
        if #available(iOS 26.0, *) {
            return "liquid-glass"
        }
        return "vibrancy"
    }

    private func ensureTabBar() -> UITabBar? {
        if let bar = tabBar { return bar }
        guard let webView = webView, let host = webView.superview else { return nil }
        let bar = UITabBar()
        bar.delegate = self
        bar.translatesAutoresizingMaskIntoConstraints = false
        if #unavailable(iOS 26.0) {
            let appearance = UITabBarAppearance()
            appearance.configureWithDefaultBackground()
            appearance.backgroundEffect = UIBlurEffect(style: .systemChromeMaterial)
            bar.standardAppearance = appearance
            bar.scrollEdgeAppearance = appearance
        }
        host.addSubview(bar)
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: host.bottomAnchor),
        ])
        tabBar = bar
        return bar
    }

    @objc public func tabs(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(TabsArgs.self)
        DispatchQueue.main.async {
            guard let bar = self.ensureTabBar() else {
                invoke.reject("web view is not attached yet")
                return
            }
            let items = args.tabs.enumerated().map { index, tab in
                UITabBarItem(title: tab.title, image: UIImage(systemName: tab.symbol), tag: index)
            }
            bar.setItems(items, animated: false)
            if let selected = args.selected, selected >= 0, selected < items.count {
                bar.selectedItem = items[selected]
            }
            invoke.resolve(["material": self.materialName()])
        }
    }

    @objc public func select(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(IndexArgs.self)
        DispatchQueue.main.async {
            if let bar = self.tabBar, let items = bar.items {
                bar.selectedItem = args.index >= 0 && args.index < items.count ? items[args.index] : nil
            }
            invoke.resolve()
        }
    }

    @objc public func visibility(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(VisibilityArgs.self)
        DispatchQueue.main.async {
            if let bar = self.tabBar {
                UIView.animate(withDuration: 0.25) {
                    bar.alpha = args.visible ? 1 : 0
                }
                bar.isUserInteractionEnabled = args.visible
            }
            invoke.resolve()
        }
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        trigger("tabSelected", data: ["index": item.tag])
    }
}

@_cdecl("init_plugin_native_glass")
func initPlugin() -> Plugin {
    return NativeGlassPlugin()
}
