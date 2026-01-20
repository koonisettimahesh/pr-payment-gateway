const path = require("path");

module.exports = {
  mode: "production",
  entry: "./src/sdk/PaymentGateway.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "checkout.js",
    library: {
      name: "PaymentGateway",
      type: "window",
      export: "default",
    },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
      {
        test: /\.jsx$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
          },
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx"],
  },
};
