function onEvent(name, value1, value2)
	if name == 'DadGroupY' then
		--setProperty('dadGroup.y', value1)
		doTweenY('dadGroupY', 'dadGroup', value1, 0.0001, 'Linear')
	end
end