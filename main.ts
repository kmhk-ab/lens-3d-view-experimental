import { Main } from "@k8slens/extensions";

export default class ThreeJsExtensionMain extends Main.LensExtension {
  onActivate() {
    console.log('threejs-visualization-extension activated');
  }

  onDeactivate() {
    console.log('threejs-visualization-extension deactivated');
  }
}