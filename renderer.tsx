import React from "react";
import { Renderer } from "@k8slens/extensions";
import { ThreeJsVisualizationPage } from "./threejs-page";
import ThreeDRotationIcon from '@mui/icons-material/ThreeDRotation';

export default class ThreeJsExtension extends Renderer.LensExtension {
  clusterPages = [
    {
      id: "threejs-visualization-page",
      components: {
        Page: () => <ThreeJsVisualizationPage extension={this} />,
      }
    }
  ]

  clusterPageMenus = [
    {
      target: { pageId: "threejs-visualization-page" },
      title: "3D View",
      components: {
        Icon: ThreeDRotationIcon,
      }
    }
  ]
}