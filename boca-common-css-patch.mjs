const svgConnectorNode=cy=>`<circle cx='0' cy='${cy}' r='.15' stroke-width='.05' stroke='black' fill='white' />`

export const svgConnector=
	"data:image/svg+xml;charset=UTF-8,<svg xmlns='http://www.w3.org/2000/svg' version='1.1' height='3em' width='3em' viewBox='-1 -1 2 2'>"+
	"<path d='M 0,-.8 Q 1,0 0,+.8' stroke='black' stroke-width='.05' fill='none' />"+
	svgConnectorNode('-.8')+
	svgConnectorNode('+.8')+
	"</svg>"
